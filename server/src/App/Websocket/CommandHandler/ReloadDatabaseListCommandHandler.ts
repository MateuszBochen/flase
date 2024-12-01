import AbstractCommandHandler from './AbstractCommandHandler';
import Database from '../../../Driver/Type/Data/Database';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';


class ReloadDatabaseListCommandHandler extends AbstractCommandHandler<null> {
  handle = (data: null): void => {
    this.driver.getListOfDatabases().subscribe((databaseItem: Database) => {
      this.clientWebsocket.send<Database>(new WsMessage<Database>(
        this.command.connectionData.connection,
        MessageType.DATA_BASE_ITEM,
        databaseItem,
      ));
    });
    console.log('handled');
  }
}

export default ReloadDatabaseListCommandHandler;
