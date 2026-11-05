import AbstractCommandHandler from './AbstractCommandHandler';
import ReadOnlyGuard from '../../Driver/Query/ReadOnlyGuard';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import QueryRequestDataInterface from '../../Connection/Interface/QueryRequestDataInterface';
import TotalCountInterface from '../../Driver/Interface/Data/TotalCountInterface';
import RowDto from '../../../Driver/Dto/RowDto';
import SingleSelectRecordInterface from '../../Driver/Interface/Data/SingleSelectRecordInterface';
import SingleSelectColumnInterface from '../../Driver/Interface/Data/SingleSelectColumnInterface';
import DriverSessionInterface from '../../Driver/DriverSessionInterface';
import QueryFinishedInterface from '../../Driver/Interface/Data/QueryFinishedInterface';
import ResultFieldInterface from '../../Driver/Interface/Data/ResultFieldInterface';
import ResultColumnsBuilder, {ResultColumnsType} from '../Result/ResultColumnsBuilder';
import QueryStopwatch from '../Result/QueryStopwatch';
import CountCache, {CountedRowsInterface} from '../Result/CountCache';
import CountTimeoutError from '../../Driver/Query/CountTimeoutError';

/** longer COUNT is stopped and rows are estimated - billions of rows are counted for minutes */
export const COUNT_TIMEOUT_MS = 3000;


/**
 * command handler for select query request
 * Message order for client: columns -> records -> finished -> total count (or error at any point)
 * @author Mateusz Bochen
 */
class HandleSelectQueryRequestHandler extends AbstractCommandHandler<QueryRequestDataInterface> {

  handle = async (data: QueryRequestDataInterface): Promise<void> => {
    const stopwatch = new QueryStopwatch();
    let session: DriverSessionInterface;
    try {
      // registered by tab - running query can be cancelled
      session = await this.driver.openSession(data.database.name, data.tabId);
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
    stopwatch.mark('session');

    try {
      // table structure (types, primary keys, references) of tables used in query
      const columnsBuilder = new ResultColumnsBuilder(this.driver, data.database.name, data.query);
      await columnsBuilder.loadMetadata();
      stopwatch.mark('metadata');

      const rows = await this.streamQueries(session, data, columnsBuilder, stopwatch);

      this.clientWebsocket.send<QueryFinishedInterface>(new WsMessage<QueryFinishedInterface>(
        this.command.connectionData.connection,
        MessageType.QUERY_FINISHED,
        {tabId: data.tabId, rows, timing: stopwatch.timing()},
      ));

      // after the rows - queries of one connection run one by one, rows would wait for COUNT of whole table
      if (data.count !== false) {
        await this.sendTotal(session, data);
      }
    } catch (e) {
      this.sendError(e, data.tabId);
    } finally {
      session.release();
    }
  }

  /**
   * rows of the query for paging - remembered count of the same query, exact count when it takes at most
   * COUNT_TIMEOUT_MS, otherwise estimate of database (user can count exactly by COUNT_RECORDS).
   * Count failure is not fatal - rows were already sent.
   */
  private sendTotal = async (session: DriverSessionInterface, data: QueryRequestDataInterface): Promise<void> => {
    let countQuery: string;
    try {
      countQuery = this.driver.getCountQuery(data.query);
    } catch (e) {
      return;
    }
    const database = data.database.name;
    const cached = data.recount ? undefined : CountCache.get(this.driver, database, countQuery);
    const running = cached ? undefined : CountCache.running(this.driver, database, countQuery);
    if (cached || running) {
      // connection is not needed - free it for other queries
      session.release();
      const counted = cached ?? await running!.catch(() => null);
      if (counted) this.sendCount({tabId: data.tabId, totalCount: counted.total, estimated: counted.estimated, cached: true});
      return;
    }

    const started = Date.now();
    const counted = await CountCache.track(this.driver, database, countQuery, this.count(session, data.query));
    this.sendCount({tabId: data.tabId, totalCount: counted.total, estimated: counted.estimated, countMs: Date.now() - started});
  }

  /** exact count, estimate when it takes too long (or fails) */
  private count = async (session: DriverSessionInterface, query: string): Promise<CountedRowsInterface> => {
    try {
      return {total: (await session.countRecords(query, COUNT_TIMEOUT_MS)).totalCount, estimated: false};
    } catch (e) {
      if (!(e instanceof CountTimeoutError)) {
        console.warn(HandleSelectQueryRequestHandler.name, 'countRecords', AbstractCommandHandler.errorToString(e));
      }
      return {total: await session.estimateRecords(query).catch(() => null), estimated: true};
    }
  }

  private sendCount(payload: TotalCountInterface): void {
    this.clientWebsocket.send<TotalCountInterface>(new WsMessage<TotalCountInterface>(
      this.command.connectionData.connection,
      MessageType.SELECT_TOTAL_COUNT,
      payload,
    ));
  }

  /** resolves with number of sent rows */
  private streamQueries = (session: DriverSessionInterface, data: QueryRequestDataInterface, columnsBuilder: ResultColumnsBuilder, stopwatch: QueryStopwatch): Promise<number> => {
    let rows = 0;

    // columns are sent when the result description arrives, so they match the result exactly
    const onFields = (fields: ResultFieldInterface[]) => this.sendColumns(data, columnsBuilder.build(fields));

    return new Promise((resolve, reject) => {
      session.streamSelect(data.query, onFields, !!data.fullValues).subscribe({
        next: (rowItem: RowDto) => {
          if (rows === 0) stopwatch.mark('firstRow');
          rows++;
          this.clientWebsocket.send<SingleSelectRecordInterface>(new WsMessage<SingleSelectRecordInterface>(
            this.command.connectionData.connection,
            MessageType.SINGLE_SELECT_RECORD,
            {
              tabId: data.tabId,
              rowDataValue: rowItem.row,
            },
          ));
        },
        error: reject,
        complete: () => {
          stopwatch.mark('lastRow');
          resolve(rows);
        },
      });
    });
  }

  private sendColumns(data: QueryRequestDataInterface, result: ResultColumnsType): void {
    this.clientWebsocket.send<SingleSelectColumnInterface>(new WsMessage<SingleSelectColumnInterface>(
      this.command.connectionData.connection,
      MessageType.SINGLE_SELECT_COLUMN,
      {tabId: data.tabId, ...result},
    ));
  }
}

export default HandleSelectQueryRequestHandler;
