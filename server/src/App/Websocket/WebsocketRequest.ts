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
import DatabaseOperationCommandHandler from './CommandHandler/DatabaseOperationCommandHandler';
import {FindReplaceCommandHandler, GetBinaryValueCommandHandler} from './CommandHandler/CellToolsCommandHandlers';
import GetCatalogsCommandHandler from './CommandHandler/GetCatalogsCommandHandler';
import {
  GetLogEventsCommandHandler,
  GetReplicationCommandHandler,
  GetServerInfoCommandHandler,
  GetServerStatusCommandHandler,
  GetServerVariablesCommandHandler,
  ReplicationActionCommandHandler,
  SetServerVariableCommandHandler,
} from './CommandHandler/ServerCommandHandlers';
import {GetDatabaseObjectsCommandHandler, GetObjectDdlCommandHandler, GetServerOptionsCommandHandler} from './CommandHandler/DatabaseObjectsCommandHandlers';
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
      // valid JSON, but not a command (null, number, array...) - property access below would crash the server
      if (!command || typeof command !== 'object' || Array.isArray(command) || typeof command.command !== 'string') {
        console.error('Invalid websocket command', String(event.data).slice(0, 200));
        return;
      }
      if (!command.connectionData || typeof command.connectionData !== 'object') {
        command.connectionData = {} as any;
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
    // own property only - "constructor" or "__proto__" from client must not resolve to Object prototype
    const Handler = Object.prototype.hasOwnProperty.call(WebsocketRequest.HANDLERS, command.command) ? WebsocketRequest.HANDLERS[command.command] : null;
    if (!Handler) {
      throw new Error(`Command ${command.command} not supported`);
    }
    // handlers read fields of payload - null or primitive from client must not crash them
    const payload = command.payload && typeof command.payload === 'object' && !Array.isArray(command.payload) ? command.payload : {};
    command.payload = payload;
    // async handlers reject also when their own error handling fails - unhandled rejection would stop the whole server
    Promise.resolve()
      .then(() => new Handler(this.databaseDriver, new ClientWebSocket(this.clientWebsocket), command).handle(payload))
      .catch((e) => this.sendError(command, e));
  }

  private static readonly HANDLERS: {[command: string]: new (driver: DriverInterface, ws: ClientWebSocket, command: CommandInterface) => {handle: (data: any) => void | Promise<void>}} = {
    [CommandType.RELOAD_DATABASE_LIST]: ReloadDatabaseListCommandHandler,
    [CommandType.RELOAD_TABLES_LIST]: ReloadTablesListCommandHandler,
    [CommandType.SEND_SELECT_QUERY]: HandleSelectQueryRequestHandler,
    [CommandType.APPLY_ROW_CHANGES]: ApplyRowChangesCommandHandler,
    [CommandType.GET_TABLE_STRUCTURE]: GetTableStructureCommandHandler,
    [CommandType.CHANGE_STRUCTURE]: ChangeStructureCommandHandler,
    [CommandType.SEARCH_DATABASE]: SearchDatabaseCommandHandler,
    [CommandType.EXECUTE_STATEMENTS]: ExecuteStatementsCommandHandler,
    [CommandType.CANCEL_QUERY]: CancelQueryCommandHandler,
    [CommandType.GET_PROCESSLIST]: GetProcessListCommandHandler,
    [CommandType.KILL_PROCESS]: KillProcessCommandHandler,
    [CommandType.CREATE_TRANSFER]: CreateTransferCommandHandler,
    [CommandType.GET_USERS]: GetUsersCommandHandler,
    [CommandType.GET_USER_GRANTS]: GetUserGrantsCommandHandler,
    [CommandType.CHANGE_USER]: ChangeUserCommandHandler,
    [CommandType.GET_DATABASE_OBJECTS]: GetDatabaseObjectsCommandHandler,
    [CommandType.GET_SERVER_OPTIONS]: GetServerOptionsCommandHandler,
    [CommandType.GET_OBJECT_DDL]: GetObjectDdlCommandHandler,
    [CommandType.DATABASE_OPERATION]: DatabaseOperationCommandHandler,
    [CommandType.GET_SERVER_STATUS]: GetServerStatusCommandHandler,
    [CommandType.GET_SERVER_VARIABLES]: GetServerVariablesCommandHandler,
    [CommandType.GET_SERVER_INFO]: GetServerInfoCommandHandler,
    [CommandType.SET_SERVER_VARIABLE]: SetServerVariableCommandHandler,
    [CommandType.GET_REPLICATION]: GetReplicationCommandHandler,
    [CommandType.GET_LOG_EVENTS]: GetLogEventsCommandHandler,
    [CommandType.REPLICATION_ACTION]: ReplicationActionCommandHandler,
    [CommandType.FIND_REPLACE]: FindReplaceCommandHandler,
    [CommandType.GET_BINARY_VALUE]: GetBinaryValueCommandHandler,
    [CommandType.GET_CATALOGS]: GetCatalogsCommandHandler,
  };

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
