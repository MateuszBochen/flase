import {Observable} from 'rxjs';
import {FieldInfo, MysqlError, PoolConnection} from 'mysql';
import DriverSessionInterface from '../../DriverSessionInterface';
import TotalCountDto from '../../../../Driver/Dto/TotalCountDto';
import RowDto from '../../../../Driver/Dto/RowDto';
import UpdateResultType from '../../../../Driver/Type/UpdateResultType';
import RecordType from '../../../../Driver/Type/Data/RecordType';
import ResultFieldInterface from '../../Interface/Data/ResultFieldInterface';
import RowChangeStatementInterface from '../../Interface/Data/RowChangeStatementInterface';
const { Parser } = require('node-sql-parser');

/**
 * Single pooled mysql connection with selected database
 * @author Mateusz Bochen
 */
class MysqlSession implements DriverSessionInterface {
  private readonly connection: PoolConnection;
  private readonly parser: typeof Parser;
  private released = false;

  constructor(connection: PoolConnection, parser: typeof Parser) {
    this.connection = connection;
    this.parser = parser;
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
          resultFields.forEach((field) => flatRow[field.key] = row[field.table]?.[field.name]);
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

  release(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.connection.release();
  }

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
