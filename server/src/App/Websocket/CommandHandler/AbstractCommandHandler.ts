import CommandInterface from '../Interface/CommandInterface';
import DriverInterface from '../../Driver/DriverInterface';
import ClientWebSocket from '../ClientWebSocket';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import QueryErrorInterface from '../../Driver/Interface/Data/QueryErrorInterface';

abstract class AbstractCommandHandler<T> {
  protected driver: DriverInterface;
  protected clientWebsocket: ClientWebSocket;
  protected command: CommandInterface;

  constructor(driver: DriverInterface, clientWebsocket: ClientWebSocket, command: CommandInterface) {
    this.driver = driver;
    this.clientWebsocket = clientWebsocket;
    this.command = command;
  }

  abstract handle: (data: T) => void;

  /** inform client that command failed */
  protected sendError(error: any, tabId?: string): void {
    console.error(this.constructor.name, error);

    this.clientWebsocket.send<QueryErrorInterface>(new WsMessage<QueryErrorInterface>(
      this.command.connectionData.connection,
      MessageType.QUERY_ERROR,
      {
        command: this.command.command,
        error: AbstractCommandHandler.errorToString(error),
        tabId,
      },
    ));
  }

  /** mysql errors have sqlMessage, parser errors message, rejects may be plain strings */
  public static errorToString(error: any): string {
    if (!error) {
      return 'Unknown error';
    }
    if (typeof error === 'string') {
      return error;
    }
    return error.sqlMessage || error.message || String(error);
  }
}

export default AbstractCommandHandler;
