import {Observable} from 'rxjs';
import {FieldInfo, MysqlError, PoolConnection} from 'mysql';
import DriverSessionInterface from '../../DriverSessionInterface';
import TotalCountDto from '../../../../Driver/Dto/TotalCountDto';
import RowDto from '../../../../Driver/Dto/RowDto';
import UpdateResultType from '../../../../Driver/Type/UpdateResultType';
import RecordType from '../../../../Driver/Type/Data/RecordType';
import ResultFieldInterface from '../../Interface/Data/ResultFieldInterface';
import RowChangeStatementInterface from '../../Interface/Data/RowChangeStatementInterface';
import {StatementResultType} from '../../Interface/Data/StatementInterface';
const { Parser } = require('node-sql-parser');

/**
 * Single pooled mysql connection with selected database
 * @author Mateusz Bochen
 */
class MysqlSession implements DriverSessionInterface {
  private readonly connection: PoolConnection;
  private readonly parser: typeof Parser;
  private released = false;
  private readonly onRelease?: () => void;

  constructor(connection: PoolConnection, parser: typeof Parser, onRelease?: () => void) {
    this.connection = connection;
    this.parser = parser;
    this.onRelease = onRelease;
  }

  /** thread of the connection on database server - used by KILL QUERY */
  get threadId(): number | null {
    return this.connection.threadId;
  }

  countRecords(query: string): Promise<TotalCountDto> {
    return new Promise((resolve, reject) => {
      let countQuery: string;
      try {
        countQuery = this.getAllCountRowsQuery(query);
      } catch (e) {
        reject(e);
        return;
      }

      this.connection.query(countQuery, (err: MysqlError | null, results: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(new TotalCountDto(+results[0].total));
      });
    });
  }

  streamSelect(query: string, onFields?: (fields: ResultFieldInterface[]) => void): Observable<RowDto> {
    console.log(`\x1b[33m Query Stream: ${query} \x1b[0m`);

    return new Observable(observer => {
      let resultFields: ResultFieldInterface[] = [];

      // values are nested by table alias, so same column names of joined tables do not overwrite each other
      this.connection.query({sql: query, nestTables: true})
        .on('error', (error: MysqlError) => observer.error(error))
        .on('fields', (fields: FieldInfo[]) => {
          resultFields = MysqlSession.toResultFields(fields || []);
          onFields?.(resultFields);
        })
        .on('result', (row: {[table: string]: RecordType}) => {
          const flatRow: RecordType = {};
          resultFields.forEach((field) => flatRow[field.key] = MysqlSession.serializeValue(row[field.table]?.[field.name]));
          observer.next(new RowDto(flatRow));
        })
        // 'end' is emitted also after error - complete is then ignored by rxjs
        .on('end', () => observer.complete());
    });
  }

  updateQuery(query: string): Promise<UpdateResultType> {
    return new Promise((resolve, reject) => {
      this.connection.query(query, (err: MysqlError | null, result: any) => {
        if (err) {
          reject(err);
          return;
        }

        resolve({
          affectedRows: +result.affectedRows,
          message: `${result.message}): ${query}`,
        });
      });
    });
  }

  async executeInTransaction(statements: RowChangeStatementInterface[]): Promise<number> {
    let affectedRows = 0;
    await this.query('START TRANSACTION');

    try {
      for (const statement of statements) {
        const result = await this.query(statement.sql);
        // FOUND_ROWS flag is on - affectedRows means matched rows, also when value did not change
        if (statement.expectOneRow && +result.affectedRows !== 1) {
          throw new Error(`Expected 1 row, matched ${+result.affectedRows}. Row was changed or removed meanwhile? Nothing was saved. ${statement.sql}`);
        }
        affectedRows += +result.affectedRows;
      }
      await this.query('COMMIT');
    } catch (e: any) {
      await this.query('ROLLBACK').catch(() => undefined);
      if (e?.sqlMessage) {
        e.sqlMessage = `${e.sqlMessage}. Nothing was saved. ${e.sql || ''}`;
      }
      throw e;
    }

    return affectedRows;
  }

  execute(
    sql: string,
    onFields: (fields: ResultFieldInterface[]) => void,
    onRow: (row: RecordType) => void,
    maxRows: number,
  ): Promise<StatementResultType> {
    return new Promise((resolve, reject) => {
      let resultFields: ResultFieldInterface[] | null = null;
      let rows = 0;
      let okPacket: any = null;
      let failed = false;

      this.connection.query({sql, nestTables: true})
        .on('error', (error: MysqlError) => {
          failed = true;
          reject(error);
        })
        .on('fields', (fields: FieldInfo[]) => {
          // procedures can return more result sets - only the first one is shown
          if (!resultFields && fields) {
            resultFields = MysqlSession.toResultFields(fields);
            onFields(resultFields);
          }
        })
        .on('result', (row: any) => {
          if (row?.constructor?.name === 'OkPacket') {
            okPacket = row;
            return;
          }
          if (!resultFields) {
            return;
          }
          rows++;
          // rest of rows is read but not sent - result without LIMIT must not flood client
          if (rows <= maxRows) {
            const flatRow: RecordType = {};
            resultFields.forEach((field) => flatRow[field.key] = MysqlSession.serializeValue(row[field.table]?.[field.name]));
            onRow(flatRow);
          }
        })
        .on('end', () => {
          if (failed) {
            return;
          }
          if (resultFields) {
            resolve({kind: 'rows', rows, truncated: rows > maxRows});
          } else {
            resolve({
              kind: 'ok',
              affectedRows: Number(okPacket?.affectedRows || 0),
              changedRows: Number(okPacket?.changedRows || 0),
              insertId: Number(okPacket?.insertId || 0),
              warningCount: Number(okPacket?.warningCount || 0),
              message: String(okPacket?.message || '').replace(/^\(|\)$/g, '').trim(),
            });
          }
        });
    });
  }

  release(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.onRelease?.();
    this.connection.release();
  }

  /** binary values (BLOB, BINARY) would be sent as huge array of bytes - client gets size, hex preview and text */
  private static serializeValue(value: any): any {
    if (!Buffer.isBuffer(value)) {
      return value;
    }
    const previewBytes = value.subarray(0, MysqlSession.BINARY_PREVIEW_BYTES);
    const text = value.length <= MysqlSession.BINARY_TEXT_BYTES ? value.toString('utf8') : null;
    // replacement character = not valid utf8, control characters = not text
    const isText = text !== null && !text.includes('\uFFFD') && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
    return {
      binary: true,
      size: value.length,
      hex: previewBytes.toString('hex'),
      truncated: value.length > previewBytes.length,
      text: isText ? text : null,
    };
  }

  private static readonly BINARY_PREVIEW_BYTES = 4096;
  private static readonly BINARY_TEXT_BYTES = 64 * 1024;

  /** key is column name, `table.name` when name repeats in result */
  private static toResultFields(fields: FieldInfo[]): ResultFieldInterface[] {
    const nameCount = new Map<string, number>();
    fields.forEach((field) => nameCount.set(field.name, (nameCount.get(field.name) || 0) + 1));

    const usedKeys = new Set<string>();
    return fields.map((field, index) => {
      let key = nameCount.get(field.name)! > 1 && field.table ? `${field.table}.${field.name}` : field.name;
      if (usedKeys.has(key)) {
        key = `${key}#${index}`;
      }
      usedKeys.add(key);

      return {
        key,
        name: field.name,
        orgName: field.orgName,
        table: field.table,
        orgTable: field.orgTable,
        db: field.db,
      };
    });
  }

  private query(sql: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.connection.query(sql, (err: MysqlError | null, result: any) => err ? reject(err) : resolve(result));
    });
  }

  /**
   * Function helping change select query into count query.
   * Grouped / distinct queries are wrapped into sub select so groups are counted, not rows.
   * Other queries just replace columns with COUNT(*) - sub select would fail on duplicated
   * column names (SELECT * FROM a JOIN b).
   */
  private getAllCountRowsQuery(query: string): string {
    const parsed = this.parser.astify(query);
    const statements = Array.isArray(parsed) ? parsed : [parsed];

    if (statements.length !== 1 || statements[0].type !== 'select') {
      throw new Error('Only single SELECT query can be counted');
    }

    const ast = statements[0];
    ast.limit = null;
    ast.orderby = null;

    const groupBy = Array.isArray(ast.groupby) ? ast.groupby : ast.groupby?.columns;
    if (ast.distinct || groupBy?.length || ast.having) {
      return `SELECT COUNT(*) AS total FROM (${this.parser.sqlify(ast)}) AS flase_count`;
    }

    ast.columns = [
      {
        expr: {
          type: 'aggr_func',
          name: 'COUNT',
          args: {expr: {type: 'star', value: '*'}},
          over: null,
        },
        as: 'total',
      },
    ];

    return this.parser.sqlify(ast);
  }
}

export default MysqlSession;
