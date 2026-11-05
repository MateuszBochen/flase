import AbstractCommandHandler from './AbstractCommandHandler';
import ReadOnlyGuard from '../../Driver/Query/ReadOnlyGuard';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import QueryRequestDataInterface from '../../Connection/Interface/QueryRequestDataInterface';
import TotalCountInterface from '../../Driver/Interface/Data/TotalCountInterface';
import DriverSessionInterface from '../../Driver/DriverSessionInterface';
import CountCache from '../Result/CountCache';

/**
 * Exact COUNT of grid query without time limit - asked by user when rows were only estimated.
 * Session is registered by tab, so Cancel of the grid stops it.
 * @author Mateusz Bochen
 */
class CountRecordsCommandHandler extends AbstractCommandHandler<QueryRequestDataInterface> {

  handle = async (data: QueryRequestDataInterface): Promise<void> => {
    const started = Date.now();
    let session: DriverSessionInterface | undefined;
    try {
      const countQuery = this.driver.getCountQuery(data.query);
      session = await this.driver.openSession(data.database.name, data.tabId);
      if (ReadOnlyGuard.isReadOnly(this.command)) {
        await session.setReadOnly();
      }
      const {totalCount} = await session.countRecords(data.query);
      CountCache.set(this.driver, data.database.name, countQuery, {total: totalCount, estimated: false});
      this.send({tabId: data.tabId, totalCount, estimated: false, countMs: Date.now() - started});
    } catch (e) {
      this.send({tabId: data.tabId, totalCount: null, error: AbstractCommandHandler.errorToString(e), countMs: Date.now() - started});
    } finally {
      session?.release();
    }
  }

  private send(payload: TotalCountInterface): void {
    this.clientWebsocket.send<TotalCountInterface>(new WsMessage<TotalCountInterface>(this.command.connectionData.connection, MessageType.SELECT_TOTAL_COUNT, payload));
  }
}

export default CountRecordsCommandHandler;
