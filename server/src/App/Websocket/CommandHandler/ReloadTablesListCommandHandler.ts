import AbstractCommandHandler from './AbstractCommandHandler';
import DatabaseInterface from '../../Driver/Interface/Data/DatabaseInterface';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import TableInformationInterface from '../../Driver/Interface/Data/TableInformationInterface';

class ReloadTablesListCommandHandler extends AbstractCommandHandler<DatabaseInterface> {

  handle = (data: DatabaseInterface): void => {
    this.driver.getListOfTablesInDatabase(data.name).subscribe((table) => {
      this.clientWebsocket.send<TableInformationInterface>(new WsMessage<TableInformationInterface>(
        this.command.connectionData.connection,
        MessageType.TABLE_BASE_ITEM,
        table,
      ));
    });
  }
}

export default ReloadTablesListCommandHandler;
