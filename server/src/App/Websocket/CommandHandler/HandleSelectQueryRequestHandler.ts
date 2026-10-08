import AbstractCommandHandler from './AbstractCommandHandler';
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


/**
 * command handler for select query request
 * Message order for client: total count -> columns -> records -> finished (or error at any point)
 * @author Mateusz Bochen
 */
class HandleSelectQueryRequestHandler extends AbstractCommandHandler<QueryRequestDataInterface> {

  handle = async (data: QueryRequestDataInterface): Promise<void> => {
    let session: DriverSessionInterface;
    try {
      // registered by tab - running query can be cancelled
      session = await this.driver.openSession(data.database.name, data.tabId);
    } catch (e) {
      this.sendError(e, data.tabId);
      return;
    }

    try {
      // table structure (types, primary keys, references) of tables used in query
      const columnsBuilder = new ResultColumnsBuilder(this.driver, data.database.name, data.query);
      await columnsBuilder.loadMetadata();

      // count is queued on the same connection before select, so it does not slow down rows
      const counting = this.countRecords(session, data);
      const rows = await this.streamQueries(session, data, columnsBuilder);
      await counting;

      this.clientWebsocket.send<QueryFinishedInterface>(new WsMessage<QueryFinishedInterface>(
        this.command.connectionData.connection,
        MessageType.QUERY_FINISHED,
        {tabId: data.tabId, rows},
      ));
    } catch (e) {
      this.sendError(e, data.tabId);
    } finally {
      session.release();
    }
  }

  /** count failure is not fatal - the select itself reports the sql error */
  private countRecords = (session: DriverSessionInterface, data: QueryRequestDataInterface): Promise<void> => {
    return session.countRecords(data.query).then((totalCountDto) => {
      this.clientWebsocket.send<TotalCountInterface>(new WsMessage<TotalCountInterface>(
        this.command.connectionData.connection,
        MessageType.SELECT_TOTAL_COUNT,
        {
          tabId: data.tabId,
          totalCount: totalCountDto.totalCount,
        },
      ));
    }).catch((e) => {
      console.warn(HandleSelectQueryRequestHandler.name, 'countRecords', AbstractCommandHandler.errorToString(e));
    });
  }

  /** resolves with number of sent rows */
  private streamQueries = (session: DriverSessionInterface, data: QueryRequestDataInterface, columnsBuilder: ResultColumnsBuilder): Promise<number> => {
    let rows = 0;

    // columns are sent when the result description arrives, so they match the result exactly
    const onFields = (fields: ResultFieldInterface[]) => this.sendColumns(data, columnsBuilder.build(fields));

    return new Promise((resolve, reject) => {
      session.streamSelect(data.query, onFields).subscribe({
        next: (rowItem: RowDto) => {
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
        complete: () => resolve(rows),
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
