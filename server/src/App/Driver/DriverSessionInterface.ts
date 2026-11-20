import TotalCountDto from '../../Driver/Dto/TotalCountDto';
import UpdateResultType from '../../Driver/Type/UpdateResultType';
import ResultFieldInterface from './Interface/Data/ResultFieldInterface';
import RowChangeStatementInterface from './Interface/Data/RowChangeStatementInterface';
import {StatementResultType} from './Interface/Data/StatementInterface';
import RecordType from '../../Driver/Type/Data/RecordType';
import {TransactionOptionsInterface} from './ForeignKeyChecks';

/**
 * receiver of result rows - returned promise means it is full (websocket buffer of slow client),
 * reading of rows from database waits until it resolves
 */
export type RowSinkType = (row: RecordType) => void | Promise<void>;

/**
 * Dedicated database connection with a selected database.
 * Queries of one session never mix with queries of other tabs.
 * Session must be released when it is not needed anymore.
 */
interface DriverSessionInterface {

  /**
   * Function returns total rows of given select query.
   * timeoutMs stops the count in database - rejects with CountTimeoutError.
   */
  countRecords(query: string, timeoutMs?: number): Promise<TotalCountDto>;

  /** rows of select query by plan of database (EXPLAIN) - instant, null when database does not tell */
  estimateRecords(query: string): Promise<number | null>;

  /**
   * Stream rows of given select query to onRow, resolves when all rows were read.
   * onFields is called once with description of result columns, before first row.
   * Long texts are sent as preview, fullValues = whole.
   */
  streamSelect(query: string, onFields: (fields: ResultFieldInterface[]) => void, onRow: RowSinkType, fullValues?: boolean): Promise<void>;

  /**
   * Execute statements in one transaction, resolves with sum of affected rows.
   * Rolls back when any statement fails or does not match expected row.
   */
  executeInTransaction(statements: RowChangeStatementInterface[], options?: TransactionOptionsInterface): Promise<number>;

  /** transaction of statements executed one by one (import of CSV) - commit or rollback ends it */
  beginTransaction(): Promise<void>;

  commit(): Promise<void>;

  rollback(): Promise<void>;

  /**
   * Function execute update query.
   */
  updateQuery(query: string): Promise<UpdateResultType>;

  /**
   * Execute any statement. Result rows are reported by onFields / onRow (at most maxRows rows),
   * statements without result return affected rows.
   */
  execute(
    sql: string,
    onFields: (fields: ResultFieldInterface[]) => void,
    onRow: RowSinkType,
    maxRows: number,
  ): Promise<StatementResultType>;

  /** statements of session cannot change data or structure (read only connection) */
  setReadOnly(): Promise<void>;

  /**
   * read only mode of setReadOnly is still on - statement built at run time (PREPARE, set_config, procedure)
   * can switch it off, which the check of statement text cannot see
   */
  isReadOnly(): Promise<boolean>;

  /** cancel was requested for the session - long running work (import) stops before next statement */
  isCancelled(): boolean;

  /**
   * Return connection back to the pool
   */
  release(): void;
}

export default DriverSessionInterface;
