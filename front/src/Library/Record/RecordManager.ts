import ConnectionDataInterface from '../Connection/Interface/ConnectionDataInterface';
import CommandType from '../WebSocket/Enum/CommandType';
import ConnectionManager from '../Connection/ConnectionManager';
import QueryRequestDataInterface from './Interface/QueryRequestDataInterface';
import WebSocketQueryRequestDataInterface from './Interface/WebSocketQueryRequestDataInterface';
import ApplyRowChangesRequestInterface from './Interface/ApplyRowChangesRequestInterface';
import withBinaryUuids from '../Console/withBinaryUuids';


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
    this.connectionManager.sendCommand<WebSocketQueryRequestDataInterface>(connection, CommandType.SEND_SELECT_QUERY, {
      // query bar keeps UUID as typed, server gets X'hex' for BINARY(16) columns
      query: withBinaryUuids(connection, query.database?.name ?? null, [query.query.query])[0],
      database: query.database,
      tabId: query.tabId,
      fullValues: query.fullValues,
    } as WebSocketQueryRequestDataInterface);
  }

  /** send edited rows to server, with dryRun server only returns sql for preview */
  applyRowChanges = (connection: ConnectionDataInterface, request: ApplyRowChangesRequestInterface) => {
    this.connectionManager.sendCommand<ApplyRowChangesRequestInterface>(connection, CommandType.APPLY_ROW_CHANGES, request);
  }
}

export default RecordManager;
