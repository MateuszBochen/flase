import DriverInterface from '../Driver/DriverInterface';
import CommandInterface from './Interface/CommandInterface';
import CommandType from './Enum/CommandType';
import ReloadDatabaseListCommandHandler from './CommandHandler/ReloadDatabaseListCommandHandler';
import ClientWebSocket from './ClientWebSocket';
import ReloadTablesListCommandHandler from './CommandHandler/ReloadTablesListCommandHandler';
import DatabaseInterface from '../Driver/Interface/Data/DatabaseInterface';

class WebsocketRequest {
  private databaseDriver: DriverInterface;
  private readonly clientWebsocket: WebSocket;
  constructor(databaseDriver: DriverInterface, clientWebsocket: WebSocket) {
    this.databaseDriver = databaseDriver;
    this.clientWebsocket = clientWebsocket;
  }

  public procedure(): void {
    this.clientWebsocket.onmessage = (event) => {
      const command = JSON.parse(event.data) as CommandInterface;
      this.resolveCommand(command);
    }
  }

  private resolveCommand(command:CommandInterface) : void {
    const clientWebsocket = new ClientWebSocket(this.clientWebsocket);
    switch (command.command) {
      case CommandType.RELOAD_DATABASE_LIST:
        new ReloadDatabaseListCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;
      case CommandType.RELOAD_TABLES_LIST:
        new ReloadTablesListCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;

      default:
        console.log(`Command ${command.command} not supported`);
    }
  }
}

export default WebsocketRequest;
