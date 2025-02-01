import ConnectionDataInterface from '../Connection/Interface/ConnectionDataInterface';
import CommandType from '../WebSocket/Enum/CommandType';
import ConnectionManager from '../Connection/ConnectionManager';
import QueryRequestDataInterface from './Interface/QueryRequestDataInterface';
import CommandInterface from '../WebSocket/Interface/CommandInterface';
import WebSocketQueryRequestDataInterface from './Interface/WebSocketQueryRequestDataInterface';


class RecordManager {
  private static instance: RecordManager;

  private connectionManager: ConnectionManager;

  public static getInstance(): RecordManager {
    if (!RecordManager.instance) {
      RecordManager.instance = new RecordManager();
    }

    return RecordManager.instance;
  }


  constructor() {
    this.connectionManager = ConnectionManager.getInstance();
  }


  sendQuery = (connection: ConnectionDataInterface, query: QueryRequestDataInterface) => {

    try {
      const establishedConnection = this.connectionManager.getEstablishedConnection(connection);
      const api = this.connectionManager.getClientForConnection(establishedConnection);

      const wsQuery = {
        query: query.query.query,
        database: query.database,
        tabId: query.tabId
      } as WebSocketQueryRequestDataInterface;

      const command = {
        connectionData: establishedConnection,
        command: CommandType.SEND_SELECT_QUERY,
        payload: wsQuery,
      } as CommandInterface<WebSocketQueryRequestDataInterface>;

      api.sendCommand<WebSocketQueryRequestDataInterface>(command)

    } catch (e) {

    }
  }
}

export default RecordManager;
