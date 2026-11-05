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
import SelectAnalyser from '../../Query/SelectAnalyser';
import {serializeValue} from '../BinaryValue';
import {FOREIGN_KEY_CHECKS_OFF, TransactionOptionsInterface} from '../../ForeignKeyChecks';
import CountTimeoutError from '../../Query/CountTimeoutError';

/** select stopped by time limit - MySQL ER_QUERY_TIMEOUT, MariaDB ER_STATEMENT_TIMEOUT, interrupted query (TiDB) */
const TIMEOUT_ERRORS = [3024, 1969, 1317];

/**
 * Single pooled mysql connection with selected database
 * @author Mateusz Bochen
 */
class MysqlSession implements DriverSessionInterface {
  private readonly connection: PoolConnection;
  private readonly analyser: SelectAnalyser;
  private released = false;
  private cancelled = false;
  private readonly onRelease?: () => void;

  constructor(connection: PoolConnection, analyser: SelectAnalyser, onRelease?: () => void) {
    this.connection = connection;
    this.analyser = analyser;
    this.onRelease = onRelease;
  }

  /** thread of the connection on database server - used by KILL QUERY */
  get threadId(): number | null {
    return this.connection.threadId;
  }

  async countRecords(query: string, timeoutMs?: number): Promise<TotalCountDto> {
    const countQuery = this.analyser.getCountQuery(query);
    const limit = timeoutMs ? await this.limitTime(timeoutMs) : null;
    try {
      const [row] = await this.query(countQuery);
      return new TotalCountDto(+row.total);
    } catch (e: any) {
      if (limit && TIMEOUT_ERRORS.includes(e?.errno)) {
        throw new CountTimeoutError(timeoutMs!);
      }
      throw e;
    } finally {
      if (limit) await this.query(`SET SESSION ${limit} = DEFAULT`).catch(() => undefined);
    }
  }

  /**
   * rows of the first select of plan (joined tables multiply) - MySQL / MariaDB rows x filtered, TiDB estRows of root
   */
  async estimateRecords(query: string): Promise<number | null> {
    const plan: any[] = await this.query(`EXPLAIN ${this.analyser.getCountPlan(query).rowsQuery}`);
    if (!plan.length) {
      return null;
    }
    if (plan[0].estRows !== undefined) {
      return Math.round(Number(plan[0].estRows));
    }
    if (plan.some((row) => /Impossible WHERE|no matching row/i.test(String(row.Extra ?? '')))) {
      return 0;
    }
    const first = plan.filter((row) => String(row.id) === String(plan[0].id) && row.rows !== null && row.rows !== undefined);
    if (!first.length) {
      return null;
    }
    return Math.round(first.reduce((rows, row) => rows * Number(row.rows) * (row.filtered === undefined || row.filtered === null ? 1 : Number(row.filtered) / 100), 1));
  }

  /** variable which stops long select - MySQL / TiDB in ms, MariaDB in seconds; null when server has none */
  private async limitTime(timeoutMs: number): Promise<string | null> {
    try {
      await this.query(`SET SESSION max_execution_time = ${Math.round(timeoutMs)}`);
      return 'max_execution_time';
    } catch (e) {
      return this.query(`SET SESSION max_statement_time = ${timeoutMs / 1000}`).then(() => 'max_statement_time', () => null);
    }
  }

  streamSelect(query: string, onFields?: (fields: ResultFieldInterface[]) => void, fullValues = false): Observable<RowDto> {
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
          resultFields.forEach((field) => flatRow[field.key] = serializeValue(row[field.table]?.[field.name], fullValues));
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

  async executeInTransaction(statements: RowChangeStatementInterface[], options: TransactionOptionsInterface = {}): Promise<number> {
    const checksOff = FOREIGN_KEY_CHECKS_OFF.mysql;
    if (options.ignoreForeignKeys) {
      for (const sql of checksOff.before) await this.query(sql);
    }
    try {
      return await this.executeStatements(statements);
    } finally {
      // pooled connection is used again - checks are turned on also when transaction failed
      if (options.ignoreForeignKeys) {
        for (const sql of checksOff.after) await this.query(sql).catch(() => undefined);
      }
    }
  }

  private async executeStatements(statements: RowChangeStatementInterface[]): Promise<number> {
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
            resultFields.forEach((field) => flatRow[field.key] = serializeValue(row[field.table]?.[field.name]));
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

  async setReadOnly(): Promise<void> {
    await this.query('SET SESSION TRANSACTION READ ONLY');
  }

  async isReadOnly(): Promise<boolean> {
    // MariaDB before 11.1 knows only tx_read_only, MySQL 8 only transaction_read_only
    const rows = await this.query('SELECT @@SESSION.transaction_read_only AS ro')
      .catch(() => this.query('SELECT @@SESSION.tx_read_only AS ro'));
    return String(rows?.[0]?.ro) === '1';
  }

  /** called by adapter before KILL QUERY */
  markCancelled(): void {
    this.cancelled = true;
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  release(): void {
    if (this.released) {
      return;
    }
    this.released = true;
    this.onRelease?.();
    // transaction left open (BEGIN without COMMIT, autocommit = 0) and LOCK TABLES of interrupted import (mysqldump)
    // would block other connections while this one waits in the pool - reset of session rolls back, unlocks tables,
    // drops temporary tables and SET variables, as it would at the next use of the connection
    this.connection.changeUser({}, (error) => error ? this.connection.destroy() : this.connection.release());
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
}

export default MysqlSession;
