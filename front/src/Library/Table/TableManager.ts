import ConnectionManager from '../Connection/ConnectionManager';
import ConnectionDataInterface from '../Connection/Interface/ConnectionDataInterface';
import Database from '../Database/Interface/Database';
import CommandType from '../WebSocket/Enum/CommandType';
import CommandInterface from '../WebSocket/Interface/CommandInterface';
import TableInformationInterface from './Interface/TableInformationInterface';
import WebsocketReceivedAMessage from '../WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../WebSocket/Interface/MessageInterface';
import EventBus from '../EventBus/EventBus';
import MessageType from '../WebSocket/Enum/MessageType';
import TableInformationWasReceived from './Event/TableInformationWasReceived';
import LoopThrough from '../Loop/LoopThrough';

class TableManager {
  private static instance: TableManager;

  private connectionManager: ConnectionManager;

  /** first key is connection id, second key is database name */
  private tablesList: {[key:string]: {[key:string]: {[key:string]: TableInformationInterface}}} = {}

  public static getInstance(): TableManager {
    if (!TableManager.instance) {
      TableManager.instance = new TableManager();
    }

    return TableManager.instance;
  }


  private constructor() {
    this.connectionManager = ConnectionManager.getInstance();

    /** enable subscriber for websocket messages */
    EventBus.subscribe<MessageInterface<TableInformationInterface>>(WebsocketReceivedAMessage.name, (messageEvent) => {
      const message = messageEvent.getData();
      // filter messages
      if (message.message === MessageType.TABLE_BASE_ITEM) {
        if (!this.tablesList[message.connection.id]) {
          this.tablesList[message.connection.id] = {};
          this.tablesList[message.connection.id][message.payload.dataBaseName] = {};
        }

        if (!this.tablesList[message.connection.id][message.payload.dataBaseName]) {
          this.tablesList[message.connection.id][message.payload.dataBaseName] = {};
        }

        this.tablesList[message.connection.id][message.payload.dataBaseName][message.payload.tableName] = message.payload;

        EventBus.emit(new TableInformationWasReceived({
          tableInformation: message.payload,
          connection: message.connection,
        }));
      }
    });
  }

  getTablesListForDatabase(connection: ConnectionDataInterface, database: Database): TableInformationInterface[] {
    if (!this.tablesList[connection.id]) {
      return [];
    }
    if (!this.tablesList[connection.id][database.name]) {
      return [];
    }
    const list:TableInformationInterface[] = [];
     LoopThrough.loop(this.tablesList[connection.id][database.name]).subscribe((item) => list.push(item));
     return list;
  }

  askForTableList(connection: ConnectionDataInterface, database: Database, forceReload: boolean): void {

    if (!forceReload && this.tablesList[connection.id] && this.tablesList[connection.id][database.name]) {
      return;
    }

    if (this.tablesList[connection.id] && this.tablesList[connection.id][database.name]) {
      delete this.tablesList[connection.id][database.name];
    }

    try {
      const establishedConnection = this.connectionManager.getEstablishedConnection(connection);
      const api = this.connectionManager.getClientForConnection(establishedConnection);

      const command = {
        connectionData: establishedConnection,
        command: CommandType.RELOAD_TABLES_LIST,
        payload: database,
      } as CommandInterface<Database>
      api.sendCommand(command);

    } catch (e) {}
  }

}

export default TableManager;
