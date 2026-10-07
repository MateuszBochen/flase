import {Observable} from 'rxjs';
import {FieldInfo, MysqlError, PoolConnection} from 'mysql';
import DriverSessionInterface from '../../DriverSessionInterface';
import TotalCountDto from '../../../../Driver/Dto/TotalCountDto';
import RowDto from '../../../../Driver/Dto/RowDto';
import UpdateResultType from '../../../../Driver/Type/UpdateResultType';
import RecordType from '../../../../Driver/Type/Data/RecordType';
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

  streamSelect(query: string, onFields?: (fieldNames: string[]) => void): Observable<RowDto> {
    console.log(`\x1b[33m Query Stream: ${query} \x1b[0m`);

    return new Observable(observer => {
      this.connection.query(query)
        .on('error', (error: MysqlError) => observer.error(error))
        .on('fields', (fields: FieldInfo[]) => {
          if (onFields && fields) {
            onFields(fields.map((field) => field.name));
          }
        })
        .on('result', (row: RecordType) => observer.next(new RowDto(row)))
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

  release(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.connection.release();
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
