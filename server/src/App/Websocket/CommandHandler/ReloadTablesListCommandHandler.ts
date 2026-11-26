import AbstractCommandHandler from './AbstractCommandHandler';
import DatabaseInterface from '../../Driver/Interface/Data/DatabaseInterface';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import TableInformationInterface from '../../Driver/Interface/Data/TableInformationInterface';

class ReloadTablesListCommandHandler extends AbstractCommandHandler<DatabaseInterface> {

  handle = (data: DatabaseInterface): void => {
    // end of the list - sidebar stops its loader
    const finished = () => this.clientWebsocket.send<{dataBaseName: string}>(new WsMessage<{dataBaseName: string}>(
      this.command.connectionData.connection,
      MessageType.TABLES_LIST_FINISHED,
      {dataBaseName: data.name},
    ));
    this.driver.getListOfTablesInDatabase(data.name).subscribe({
      next: (table) => {
        this.clientWebsocket.send<TableInformationInterface>(new WsMessage<TableInformationInterface>(
          this.command.connectionData.connection,
          MessageType.TABLE_BASE_ITEM,
          table,
        ));
      },
      error: (error) => {
        this.sendError(error);
        finished();
      },
      complete: finished,
    });
  }
}

export default ReloadTablesListCommandHandler;
