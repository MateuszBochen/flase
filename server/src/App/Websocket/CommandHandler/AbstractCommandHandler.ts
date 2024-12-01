import CommandInterface from '../Interface/CommandInterface';
import DriverInterface from '../../Driver/DriverInterface';
import ClientWebSocket from '../ClientWebSocket';

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
}

export default AbstractCommandHandler;
