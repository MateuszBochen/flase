import DriverInterface from '../Driver/DriverInterface';
import CommandInterface from './Interface/CommandInterface';
import CommandType from './Enum/CommandType';
import ReloadDatabaseListCommandHandler from './CommandHandler/ReloadDatabaseListCommandHandler';
import ClientWebSocket from './ClientWebSocket';
import ReloadTablesListCommandHandler from './CommandHandler/ReloadTablesListCommandHandler';
import HandleSelectQueryRequestHandler from './CommandHandler/HandleSelectQueryRequestHandler';
import ApplyRowChangesCommandHandler from './CommandHandler/ApplyRowChangesCommandHandler';
import GetTableStructureCommandHandler from './CommandHandler/GetTableStructureCommandHandler';
import ChangeStructureCommandHandler from './CommandHandler/ChangeStructureCommandHandler';
import SearchDatabaseCommandHandler from './CommandHandler/SearchDatabaseCommandHandler';
import ExecuteStatementsCommandHandler from './CommandHandler/ExecuteStatementsCommandHandler';
import CreateTransferCommandHandler from './CommandHandler/CreateTransferCommandHandler';
import {CancelQueryCommandHandler, GetProcessListCommandHandler, KillProcessCommandHandler} from './CommandHandler/ProcessCommandHandlers';
import WsMessage from './Dto/WsMessage';
import ReadOnlyGuard from '../Driver/Query/ReadOnlyGuard';
import {ChangeUserCommandHandler, GetUserGrantsCommandHandler, GetUsersCommandHandler} from './CommandHandler/UserCommandHandlers';
import MessageType from './Enum/MessageType';
import QueryErrorInterface from '../Driver/Interface/Data/QueryErrorInterface';

class WebsocketRequest {
  /** same command sent again in this time is skipped (react strict mode runs effects twice) */
  private static readonly DUPLICATE_COMMAND_WINDOW_MS = 500;

  private databaseDriver: DriverInterface;
  private readonly clientWebsocket: WebSocket;
  private lastCommand: string = '';
  private lastCommandTimeStamp: number = 0;

  /** read only enforced by server - flag sent by browser is not trusted */
  private readonly forceReadOnly: boolean;

  constructor(databaseDriver: DriverInterface, clientWebsocket: WebSocket, forceReadOnly: boolean = false) {
    this.databaseDriver = databaseDriver;
    this.clientWebsocket = clientWebsocket;
    this.forceReadOnly = forceReadOnly;
  }

  public procedure(): void {
    this.clientWebsocket.onmessage = (event) => {
      let command: CommandInterface;
      try {
        command = JSON.parse(event.data) as CommandInterface;
      } catch (e) {
        console.error('Invalid websocket message', event.data);
        return;
      }

      if (this.forceReadOnly) {
        // guard and read only database sessions read the flag from command
        command.connectionData = command.connectionData || ({} as any);
        command.connectionData.connection = {...(command.connectionData.connection || {}), readOnly: true} as any;
      }

      if (this.isDuplicate(event.data)) {
        console.log(`Command ${command.command} skipped - duplicate`);
        return;
      }

      try {
        this.resolveCommand(command);
      } catch (e) {
        this.sendError(command, e);
      }
    }
  }

  private isDuplicate(rawCommand: string): boolean {
    const now = Date.now();
    const isDuplicate = rawCommand === this.lastCommand
      && now - this.lastCommandTimeStamp < WebsocketRequest.DUPLICATE_COMMAND_WINDOW_MS;

    this.lastCommand = rawCommand;
    this.lastCommandTimeStamp = now;
    return isDuplicate;
  }

  private resolveCommand(command:CommandInterface) : void {
    const refused = ReadOnlyGuard.refuseCommand(command);
    if (refused) {
      throw new Error(refused);
    }
    const clientWebsocket = new ClientWebSocket(this.clientWebsocket);
    switch (command.command) {
      case CommandType.RELOAD_DATABASE_LIST:
        new ReloadDatabaseListCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;
      case CommandType.RELOAD_TABLES_LIST:
        new ReloadTablesListCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;
      case CommandType.SEND_SELECT_QUERY:
        new HandleSelectQueryRequestHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;
      case CommandType.APPLY_ROW_CHANGES:
        new ApplyRowChangesCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;
      case CommandType.GET_TABLE_STRUCTURE:
        new GetTableStructureCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;
      case CommandType.CHANGE_STRUCTURE:
        new ChangeStructureCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;
      case CommandType.SEARCH_DATABASE:
        new SearchDatabaseCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;
      case CommandType.EXECUTE_STATEMENTS:
        new ExecuteStatementsCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;
      case CommandType.CANCEL_QUERY:
        new CancelQueryCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;
      case CommandType.GET_PROCESSLIST:
        new GetProcessListCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;
      case CommandType.KILL_PROCESS:
        new KillProcessCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;
      case CommandType.CREATE_TRANSFER:
        new CreateTransferCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;
      case CommandType.GET_USERS:
        new GetUsersCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;
      case CommandType.GET_USER_GRANTS:
        new GetUserGrantsCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;
      case CommandType.CHANGE_USER:
        new ChangeUserCommandHandler(this.databaseDriver, clientWebsocket, command).handle(command.payload);
        return;
      default:
        throw new Error(`Command ${command.command} not supported`);
    }
  }

  private sendError(command: CommandInterface, error: any): void {
    console.error(error);
    new ClientWebSocket(this.clientWebsocket).send<QueryErrorInterface>(new WsMessage<QueryErrorInterface>(
      command.connectionData?.connection,
      MessageType.QUERY_ERROR,
      {
        command: command.command,
        error: error?.message || String(error),
        tabId: command.payload?.tabId,
      },
    ));
  }
}

export default WebsocketRequest;
