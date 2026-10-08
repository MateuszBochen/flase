import {Observable} from 'rxjs';
import TotalCountDto from '../../Driver/Dto/TotalCountDto';
import RowDto from '../../Driver/Dto/RowDto';
import UpdateResultType from '../../Driver/Type/UpdateResultType';
import ResultFieldInterface from './Interface/Data/ResultFieldInterface';
import RowChangeStatementInterface from './Interface/Data/RowChangeStatementInterface';
import {StatementResultType} from './Interface/Data/StatementInterface';
import RecordType from '../../Driver/Type/Data/RecordType';

/**
 * Dedicated database connection with a selected database.
 * Queries of one session never mix with queries of other tabs.
 * Session must be released when it is not needed anymore.
 */
interface DriverSessionInterface {

  /**
   * Function returns total rows of given select query
   */
  countRecords(query: string): Promise<TotalCountDto>;

  /**
   * Stream rows of given select query. Observable completes when all rows were sent.
   * onFields is called once with description of result columns, before first row.
   */
  streamSelect(query: string, onFields?: (fields: ResultFieldInterface[]) => void): Observable<RowDto>;

  /**
   * Execute statements in one transaction, resolves with sum of affected rows.
   * Rolls back when any statement fails or does not match expected row.
   */
  executeInTransaction(statements: RowChangeStatementInterface[]): Promise<number>;

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
    onRow: (row: RecordType) => void,
    maxRows: number,
  ): Promise<StatementResultType>;

  /**
   * Return connection back to the pool
   */
  release(): void;
}

export default DriverSessionInterface;
