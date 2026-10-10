import ConnectionManager from '../Connection/ConnectionManager';
import ConnectionDataInterface from '../Connection/Interface/ConnectionDataInterface';
import CommandType from '../WebSocket/Enum/CommandType';
import {ExecuteStatementsRequestInterface} from './StatementInterface';

/**
 * SQL console and server tools: statements, cancel of running query, process list.
 * Answers come as websocket messages for tabId of the request.
 */
class ConsoleApi {
  private static instance: ConsoleApi;

  public static getInstance(): ConsoleApi {
    if (!ConsoleApi.instance) {
      ConsoleApi.instance = new ConsoleApi();
    }
    return ConsoleApi.instance;
  }

  execute(connection: ConnectionDataInterface, request: ExecuteStatementsRequestInterface): void {
    this.send(connection, CommandType.EXECUTE_STATEMENTS, request);
  }

  /** KILL QUERY of session running for the tab (console or data grid) */
  cancel(connection: ConnectionDataInterface, tabId: string): void {
    this.send(connection, CommandType.CANCEL_QUERY, {tabId});
  }

  processList(connection: ConnectionDataInterface, tabId: string): void {
    this.send(connection, CommandType.GET_PROCESSLIST, {tabId});
  }

  killProcess(connection: ConnectionDataInterface, tabId: string, id: number, wholeConnection: boolean): void {
    this.send(connection, CommandType.KILL_PROCESS, {tabId, id, connection: wholeConnection});
  }

  private send<T>(connection: ConnectionDataInterface, command: CommandType, payload: T): void {
    try {
      const manager = ConnectionManager.getInstance();
      const establishedConnection = manager.getEstablishedConnection(connection);
      manager.getClientForConnection(establishedConnection).sendCommand<T>({
        connectionData: establishedConnection,
        command,
        payload,
      });
    } catch (e) {
      console.error('Connection not found', e);
    }
  }
}

export default ConsoleApi;
