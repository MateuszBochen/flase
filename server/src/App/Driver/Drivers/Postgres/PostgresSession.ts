import {Observable} from 'rxjs';
import {PoolClient} from 'pg';
import DriverSessionInterface from '../../DriverSessionInterface';
import TotalCountDto from '../../../../Driver/Dto/TotalCountDto';
import RowDto from '../../../../Driver/Dto/RowDto';
import UpdateResultType from '../../../../Driver/Type/UpdateResultType';
import RecordType from '../../../../Driver/Type/Data/RecordType';
import ResultFieldInterface from '../../Interface/Data/ResultFieldInterface';
import RowChangeStatementInterface from '../../Interface/Data/RowChangeStatementInterface';
import {StatementResultType} from '../../Interface/Data/StatementInterface';
import SelectAnalyser from '../../Query/SelectAnalyser';
import PostgresSql from './PostgresSql';
import {serializeBinaryValue} from '../BinaryValue';
const Cursor = require('pg-cursor');

/** rows read from cursor at once */
const BATCH_ROWS = 200;

/** field of pg result description */
export interface PgFieldInterface {
  name: string;
  tableID: number;
  columnID: number;
}

/** schema, table and column names of result fields */
export type FieldsResolverType = (fields: PgFieldInterface[], query: string) => Promise<ResultFieldInterface[]>;

/**
 * Single pooled PostgreSQL connection with search_path set to selected schema
 * @author Mateusz Bochen
 */
class PostgresSession implements DriverSessionInterface {
  private released = false;
  private cancelled = false;

  constructor(
    private readonly client: PoolClient,
    private readonly analyser: SelectAnalyser,
    private readonly resolveFields: FieldsResolverType,
    private readonly onRelease?: () => void,
  ) {
  }

  /** backend process on server - used by pg_cancel_backend */
  get processId(): number | null {
    return (this.client as any).processID ?? null;
  }

  async countRecords(query: string): Promise<TotalCountDto> {
    const result = await this.client.query({text: this.analyser.getCountQuery(query), types: PostgresSql.types});
    return new TotalCountDto(Number(result.rows[0].total));
  }

  streamSelect(query: string, onFields?: (fields: ResultFieldInterface[]) => void): Observable<RowDto> {
    console.log(`\x1b[33m Query Stream: ${query} \x1b[0m`);

    return new Observable(observer => {
      this.readCursor(query, async (fields) => {
        const resultFields = await this.resolveFields(fields, query);
        onFields?.(resultFields);
        return resultFields;
      }, (row) => observer.next(new RowDto(row)))
        .then(() => observer.complete())
        .catch((error) => observer.error(error));
    });
  }

  updateQuery(query: string): Promise<UpdateResultType> {
    return this.client.query(query).then((result) => ({
      affectedRows: Number(result.rowCount || 0),
      message: `${result.command} ${result.rowCount ?? ''}: ${query}`,
    }));
  }

  async executeInTransaction(statements: RowChangeStatementInterface[]): Promise<number> {
    let affectedRows = 0;
    await this.client.query('BEGIN');

    try {
      for (const statement of statements) {
        let result;
        try {
          result = await this.client.query(statement.sql);
        } catch (e: any) {
          e.message = `${e.message}. Nothing was saved. ${statement.sql}`;
          throw e;
        }
        if (statement.expectOneRow && Number(result.rowCount) !== 1) {
          throw new Error(`Expected 1 row, matched ${Number(result.rowCount)}. Row was changed or removed meanwhile? Nothing was saved. ${statement.sql}`);
        }
        affectedRows += Number(result.rowCount || 0);
      }
      await this.client.query('COMMIT');
    } catch (e) {
      await this.client.query('ROLLBACK').catch(() => undefined);
      throw e;
    }

    return affectedRows;
  }

  async execute(
    sql: string,
    onFields: (fields: ResultFieldInterface[]) => void,
    onRow: (row: RecordType) => void,
    maxRows: number,
  ): Promise<StatementResultType> {
    // USE schema of MySQL users - the same as SET search_path
    const use = /^\s*use\s+("((?:[^"]|"")+)"|`([^`]+)`|([^\s;"`]+))\s*;?\s*$/i.exec(sql);
    if (use) {
      const schema = use[2]?.replace(/""/g, '"') ?? use[3] ?? use[4];
      await this.setSearchPath(schema);
      return {kind: 'ok', affectedRows: 0, changedRows: 0, insertId: 0, warningCount: 0, message: `search_path set to ${schema}`};
    }

    // RAISE NOTICE / WARNING of the statement
    const notices: string[] = [];
    const onNotice = (notice: any) => notices.push(`${notice.severity || 'NOTICE'}: ${notice.message}`);
    this.client.on('notice', onNotice);

    try {
      let rows = 0;
      let hasFields = false;
      const result = await this.readCursor(sql, async (fields) => {
        if (!fields.length) return [];
        hasFields = true;
        const resultFields = await this.resolveFields(fields, sql);
        onFields(resultFields);
        return resultFields;
      }, (row) => {
        rows++;
        // rest of rows is read but not sent - result without LIMIT must not flood client
        if (rows <= maxRows) onRow(row);
      });

      if (hasFields) {
        return {kind: 'rows', rows, truncated: rows > maxRows};
      }
      return {
        kind: 'ok',
        affectedRows: Number(result.rowCount || 0),
        changedRows: 0,
        insertId: 0,
        warningCount: notices.length,
        message: [result.command, ...notices].filter(Boolean).join('\n'),
      };
    } finally {
      this.client.removeListener('notice', onNotice);
    }
  }

  /** search_path of session, public stays for functions of extensions */
  async setSearchPath(schema: string): Promise<void> {
    const path = schema === 'public' ? PostgresSql.identifier(schema) : `${PostgresSql.identifier(schema)}, public`;
    await this.client.query(`SET search_path TO ${path}`);
  }

  async setReadOnly(): Promise<void> {
    await this.client.query('SET default_transaction_read_only = on');
  }

  /** called by adapter before pg_cancel_backend */
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
    this.client.release();
  }

  /**
   * Reads all rows of statement by cursor - only one batch is in memory.
   * onFields is called before first row (also for statements without result), resolves with command and row count.
   */
  private async readCursor(
    sql: string,
    onFields: (fields: PgFieldInterface[]) => Promise<ResultFieldInterface[]>,
    onRow: (row: RecordType) => void,
  ): Promise<{command: string, rowCount: number | null}> {
    const cursor = this.client.query(new Cursor(sql, [], {types: PostgresSql.types, rowMode: 'array'}));
    const read = (): Promise<{rows: any[][], result: any}> => new Promise((resolve, reject) => {
      cursor.read(BATCH_ROWS, (err: Error | null, rows: any[][], result: any) => err ? reject(err) : resolve({rows, result}));
    });

    try {
      let resultFields: ResultFieldInterface[] | null = null;
      for (;;) {
        const {rows, result} = await read();
        if (!resultFields) {
          resultFields = await onFields(result.fields || []);
        }
        rows.forEach((values) => {
          const row: RecordType = {};
          resultFields!.forEach((field, index) => row[field.key] = serializeBinaryValue(values[index]));
          onRow(row);
        });
        if (rows.length < BATCH_ROWS) {
          return {command: result.command, rowCount: result.rowCount};
        }
      }
    } finally {
      await new Promise<void>((resolve) => cursor.close(() => resolve()));
    }
  }
}

export default PostgresSession;
