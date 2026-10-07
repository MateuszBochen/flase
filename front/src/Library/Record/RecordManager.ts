import ConnectionDataInterface from '../Connection/Interface/ConnectionDataInterface';
import CommandType from '../WebSocket/Enum/CommandType';
import ConnectionManager from '../Connection/ConnectionManager';
import QueryRequestDataInterface from './Interface/QueryRequestDataInterface';
import CommandInterface from '../WebSocket/Interface/CommandInterface';
import WebSocketQueryRequestDataInterface from './Interface/WebSocketQueryRequestDataInterface';
import ApplyRowChangesRequestInterface from './Interface/ApplyRowChangesRequestInterface';


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

  /** send edited rows to server, with dryRun server only returns sql for preview */
  applyRowChanges = (connection: ConnectionDataInterface, request: ApplyRowChangesRequestInterface) => {
    try {
      const establishedConnection = this.connectionManager.getEstablishedConnection(connection);
      const api = this.connectionManager.getClientForConnection(establishedConnection);

      api.sendCommand<ApplyRowChangesRequestInterface>({
        connectionData: establishedConnection,
        command: CommandType.APPLY_ROW_CHANGES,
        payload: request,
      });
    } catch (e) {
      console.error('Connection not found', e);
    }
  }
}

export default RecordManager;
