import AbstractCommandHandler from './AbstractCommandHandler';
import DatabaseInterface from '../../Driver/Interface/Data/DatabaseInterface';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';


class ReloadDatabaseListCommandHandler extends AbstractCommandHandler<null> {
  handle = (data: null): void => {
    this.driver.getListOfDatabases().subscribe({
      next: (databaseItem: DatabaseInterface) => {
        this.clientWebsocket.send<DatabaseInterface>(new WsMessage<DatabaseInterface>(
          this.command.connectionData.connection,
          MessageType.DATABASE_BASE_ITEM,
          databaseItem,
        ));
      },
      error: (error) => this.sendError(error),
    });
  }
}

export default ReloadDatabaseListCommandHandler;
