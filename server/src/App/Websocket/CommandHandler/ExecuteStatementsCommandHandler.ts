import AbstractCommandHandler from './AbstractCommandHandler';
import ReadOnlyGuard from '../../Driver/Query/ReadOnlyGuard';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import DriverSessionInterface from '../../Driver/DriverSessionInterface';
import {
  ExecuteStatementsRequestInterface,
  ExecutionFinishedInterface,
  StatementFinishedInterface,
  StatementStartedInterface,
} from '../../Driver/Interface/Data/StatementInterface';
import ResultColumnsBuilder from '../Result/ResultColumnsBuilder';
import SingleSelectColumnInterface from '../../Driver/Interface/Data/SingleSelectColumnInterface';
import SingleSelectRecordInterface from '../../Driver/Interface/Data/SingleSelectRecordInterface';
import {selectedDatabaseOf} from '../../Driver/Query/DatabaseSwitch';
import QueryFinishedInterface from '../../Driver/Interface/Data/QueryFinishedInterface';

const DEFAULT_MAX_ROWS = 1000;
const LIMIT_MAX_ROWS = 100000;

/**
 * SQL console - statements are executed one by one in one session (USE, variables and transactions are kept).
 * Rows of result N are sent with tabId `${tabId}:${N}` as for data grid, so the same grid can show them.
 * @author Mateusz Bochen
 */
class ExecuteStatementsCommandHandler extends AbstractCommandHandler<ExecuteStatementsRequestInterface> {

  handle = async (data: ExecuteStatementsRequestInterface): Promise<void> => {
    if (!data?.tabId || !Array.isArray(data.statements) || !data.statements.length) {
      this.sendError(new Error('Nothing to execute'), data?.tabId);
      return;
    }
    const maxRows = Math.min(Math.max(1, Number(data.maxRows) || DEFAULT_MAX_ROWS), LIMIT_MAX_ROWS);

    let session: DriverSessionInterface;
    try {
      session = await this.driver.openSession(data.database || null, data.tabId);
      if (ReadOnlyGuard.isReadOnly(this.command)) {
        await session.setReadOnly().catch((e) => {
          session.release();
          throw e;
        });
      }
    } catch (e) {
      this.sendError(e, data.tabId);
      return;
    }

    let executed = 0;
    let failed = 0;
    let database = data.database || null;
    try {
      for (let index = 0; index < data.statements.length; index++) {
        const sql = data.statements[index];
        const resultTabId = `${data.tabId}:${index}`;
        this.send<StatementStartedInterface>(MessageType.STATEMENT_STARTED, {tabId: data.tabId, index, sql});

        const started = Date.now();
        try {
          const columnsBuilder = new ResultColumnsBuilder(this.driver, database, sql);
          await columnsBuilder.loadMetadata();

          const result = await session.execute(
            sql,
            (fields) => this.send<SingleSelectColumnInterface>(MessageType.SINGLE_SELECT_COLUMN, {tabId: resultTabId, ...columnsBuilder.build(fields, false)}),
            (row) => this.send<SingleSelectRecordInterface>(MessageType.SINGLE_SELECT_RECORD, {tabId: resultTabId, rowDataValue: row as any}),
            maxRows,
          );
          executed++;

          if (result.kind === 'rows') {
            this.send<QueryFinishedInterface>(MessageType.QUERY_FINISHED, {tabId: resultTabId, rows: Math.min(result.rows, maxRows)});
          }
          // following statements use database selected by USE (schema by SET search_path)
          database = selectedDatabaseOf(sql) ?? database;

          this.send<StatementFinishedInterface>(MessageType.STATEMENT_FINISHED, {
            tabId: data.tabId, index, sql, durationMs: Date.now() - started, result,
          });
        } catch (e) {
          failed++;
          this.send<StatementFinishedInterface>(MessageType.STATEMENT_FINISHED, {
            tabId: data.tabId, index, sql, durationMs: Date.now() - started, error: AbstractCommandHandler.errorToString(e),
          });
          if (data.stopOnError !== false) {
            break;
          }
        }
      }
    } finally {
      session.release();
    }

    this.send<ExecutionFinishedInterface>(MessageType.EXECUTION_FINISHED, {
      tabId: data.tabId,
      executed,
      failed,
      skipped: data.statements.length - executed - failed,
    });
  }

  private send<T>(message: MessageType, payload: T): void {
    this.clientWebsocket.send<T>(new WsMessage<T>(this.command.connectionData.connection, message, payload));
  }
}

export default ExecuteStatementsCommandHandler;
