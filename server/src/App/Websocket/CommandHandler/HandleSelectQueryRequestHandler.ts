import AbstractCommandHandler from './AbstractCommandHandler';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import QueryRequestDataInterface from '../../Connection/Interface/QueryRequestDataInterface';
import TotalCountInterface from '../../Driver/Interface/Data/TotalCountInterface';
import RowDto from '../../../Driver/Dto/RowDto';
import SingleSelectRecordInterface from '../../Driver/Interface/Data/SingleSelectRecordInterface';
import SingleSelectColumnInterface from '../../Driver/Interface/Data/SingleSelectColumnInterface';
import ColumnInterface from '../../Driver/Interface/Data/ColumnInterface';
import DriverSessionInterface from '../../Driver/DriverSessionInterface';
import QueryFinishedInterface from '../../Driver/Interface/Data/QueryFinishedInterface';

/**
 * command handler for select query request
 * Message order for client: columns -> total count -> records -> finished (or error at any point)
 * @author Mateusz Bochen
 */
class HandleSelectQueryRequestHandler extends AbstractCommandHandler<QueryRequestDataInterface> {

  handle = async (data: QueryRequestDataInterface): Promise<void> => {
    let session: DriverSessionInterface;
    try {
      session = await this.driver.openSession(data.database.name);
    } catch (e) {
      this.sendError(e, data.tabId);
      return;
    }

    try {
      // columns from table metadata (primary keys, references), if query is simple enough to know tables
      const columnsWereSent = await this.sendColumnsFromSelect(data);

      // count is queued on the same connection before select, so it does not slow down rows
      const counting = this.countRecords(session, data);
      const rows = await this.streamQueries(session, data, columnsWereSent);
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
  private streamQueries = (session: DriverSessionInterface, data: QueryRequestDataInterface, columnsWereSent: boolean): Promise<number> => {
    let rows = 0;

    // fallback when columns are not known from table metadata, e.g. SELECT 1, SHOW ..., functions
    const onFields = columnsWereSent ? undefined : (fieldNames: string[]) => {
      this.sendColumns(data, fieldNames.map((name) => HandleSelectQueryRequestHandler.simpleColumn(name)));
    };

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

  /** resolves true when columns were sent */
  private sendColumnsFromSelect = async (data: QueryRequestDataInterface): Promise<boolean> => {
    try {
      const selectFromTypes = this.driver.getSelectFromTypeFromQuery(data.query);
      if (!selectFromTypes.length) {
        return false;
      }

      const columnsOfTables = await Promise.all(selectFromTypes.map((selectFromType) => {
        return this.driver.getColumnsOfTable(selectFromType.db || data.database.name, selectFromType);
      }));

      this.sendColumns(data, columnsOfTables.flat());
      return true;
    } catch (e) {
      // not parsable by sql parser or derived table - columns will be taken from result fields
      console.warn(HandleSelectQueryRequestHandler.name, 'sendColumnsFromSelect', AbstractCommandHandler.errorToString(e));
      return false;
    }
  }

  private sendColumns(data: QueryRequestDataInterface, columns: ColumnInterface[]): void {
    this.clientWebsocket.send<SingleSelectColumnInterface>(new WsMessage<SingleSelectColumnInterface>(
      this.command.connectionData.connection,
      MessageType.SINGLE_SELECT_COLUMN,
      {
        tabId: data.tabId,
        columns,
      },
    ));
  }

  private static simpleColumn(name: string): ColumnInterface {
    return {
      table: {databaseName: '', name: '', alias: ''},
      autoIncrement: false,
      defaultValue: null,
      name,
      nullable: true,
      primaryKey: false,
    };
  }
}

export default HandleSelectQueryRequestHandler;
