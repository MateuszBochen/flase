import AbstractCommandHandler from './AbstractCommandHandler';
import DatabaseInterface from '../../Driver/Interface/Data/DatabaseInterface';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import QueryRequestDataInterface from '../../Connection/Interface/QueryRequestDataInterface';
import TotalCountDto from '../../../Driver/Dto/TotalCountDto';
import TotalCountInterface from '../../Driver/Interface/Data/TotalCountInterface';
import SelectFromType from '../../../Driver/Type/Data/SelectFromType';
import RowDto from '../../../Driver/Dto/RowDto';
import SingleSelectRecordInterface from '../../Driver/Interface/Data/SingleSelectRecordInterface';
import SingleSelectColumnInterface from '../../Driver/Interface/Data/SingleSelectColumnInterface';

/**
 * command handler for select query request
 * @author Mateusz Bochen
 */
class HandleSelectQueryRequestHandler extends AbstractCommandHandler<QueryRequestDataInterface> {

  handle = (data: QueryRequestDataInterface): void => {

    this.driver.selectDatabase(data.database.name).then(() => {
      // first count the records
      this.countRecords(data.query);

      // send info about columns of table
      this.sendColumnsFromSelect(data.query);

      // return records
      this.streamQueries(data.query);

    }).catch(() => {
      console.log('unable to switch database');
    });

    /*this.driver.getListOfDatabases().subscribe((databaseItem: DatabaseInterface) => {
      this.clientWebsocket.send<DatabaseInterface>(new WsMessage<DatabaseInterface>(
        this.command.connectionData.connection,
        MessageType.DATABASE_BASE_ITEM,
        databaseItem,
      ));
    });
    console.log('handled');*/
  }


  private countRecords = (query: string) => {
    this.driver.countRecords(query).then((totalCountDto: TotalCountDto) => {
      // dispatch information about query total records
      const message = new WsMessage<TotalCountInterface>(
        this.command.connectionData.connection,
        MessageType.SELECT_TOTAL_COUNT,
        {
          tabId: this.command.payload.tabId,
          totalCount: totalCountDto.totalCount,
        } as TotalCountInterface,
      );

      this.clientWebsocket.send<TotalCountInterface>(message);

    });
  }


  private streamQueries = (query: string) => {
    this.driver.streamSelect(query).subscribe((rowItem: RowDto) => {

      const message = new WsMessage<SingleSelectRecordInterface>(
        this.command.connectionData.connection,
        MessageType.SINGLE_SELECT_RECORD,
        {
          tabId: this.command.payload.tabId,
          rowDataValue: rowItem.row,
        } as SingleSelectRecordInterface,
      );

      this.clientWebsocket.send<SingleSelectRecordInterface>(message);
    });
  }


  /** to test maybe will be done on front */
  private sendColumnsFromSelect = (query: string) => {

    let selectFromTypes:SelectFromType[] = [];
    try {
      selectFromTypes = this.driver.getSelectFromTypeFromQuery(query);
    } catch (e) {
      console.error(HandleSelectQueryRequestHandler.name, 'sendColumnsFromSelect', e);
      return;
    }

    selectFromTypes.forEach((selectFromType) => {
      this.driver.getColumnsOfTable(selectFromType.db || this.command.payload.database.name, selectFromType)
        .then((listOfColumnTypes) => {

          const payload:SingleSelectColumnInterface = {
            tabId: this.command.payload.tabId,
            columns: listOfColumnTypes,
          }

          const message = new WsMessage<SingleSelectColumnInterface>(
            this.command.connectionData.connection,
            MessageType.SINGLE_SELECT_COLUMN,
            payload,
          );

          this.clientWebsocket.send<SingleSelectColumnInterface>(message);
        });
    });
  }
}

export default HandleSelectQueryRequestHandler;
