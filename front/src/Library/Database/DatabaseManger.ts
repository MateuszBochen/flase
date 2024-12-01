import EstablishedConnectionInterface from '../Connection/Interface/EstablishedConnectionInterface';
import Database from './Interface/Database';
import ConnectionManager from '../Connection/ConnectionManager';
import CommandInterface from '../WebSocket/Interface/CommandInterface';
import CommandType from '../WebSocket/Enum/CommandType';
import EventBus from '../EventBus/EventBus';
import WebsocketReceivedAMessage from '../WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../WebSocket/Interface/MessageInterface';
import MessageType from '../WebSocket/Enum/MessageType';
import DatabaseWasReceived from './Event/DatabaseWasReceived';
import LoopThrough from '../Loop/LoopThrough';
import database from './Interface/Database';


class DatabaseManger {
  private static instance: DatabaseManger;

  private connectionManager: ConnectionManager;

  // key is connection id
  private databaseList: {[key:string]: {[key:string]: Database}} = {};

  public static getInstance(): DatabaseManger
  {
    if (!DatabaseManger.instance) {
      DatabaseManger.instance = new DatabaseManger();
    }

    return DatabaseManger.instance;
  }

  /** block constructor */
  private constructor() {
    this.connectionManager = ConnectionManager.getInstance();

    /** enable subscriber for websocket messages */
    EventBus.subscribe<MessageInterface<Database>>(WebsocketReceivedAMessage.name, (messageEvent) => {
      // filter only messages of database
      const message = messageEvent.getData();
      if (message.message === MessageType.DATABASE_BASE_ITEM) {
        if (!this.databaseList[message.connection.id]) {
          this.databaseList[message.connection.id] = {};
        }
        this.databaseList[message.connection.id][message.payload.name] = message.payload;
        EventBus.emit(new DatabaseWasReceived({connection: message.connection, database: message.payload}));
      }
    });
  }

  getListOfDatabaseForConnection(connectionData: EstablishedConnectionInterface): Database[] {
    if (!this.databaseList[connectionData.connection.id]) {
      return [];
    }

    const list:Database[] = [];

    LoopThrough.loop(this.databaseList[connectionData.connection.id]).subscribe((database) => list.push(database));
    return list;
  }

  aksForDatabaseList(connectionData: EstablishedConnectionInterface): void {
    const command = {
      connectionData: connectionData,
      command: CommandType.RELOAD_DATABASE_LIST,
      payload: null,
    } as CommandInterface<null>

    try {
      this.connectionManager.getClientForConnection(connectionData).sendCommand(command);
    } catch (e) {
      console.error('Connection not found');
    }
  }
}

export default DatabaseManger;
