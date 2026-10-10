import MessageInterface from '../Interface/MessageInterface';
import ConnectionDataInterface from '../../Connection/Interface/ConnectionDataInterface';
import MessageType from '../Enum/MessageType';

class WsMessage<T> implements MessageInterface<T> {
  connection: ConnectionDataInterface;
  message: MessageType;
  payload: T;


  constructor(connection: ConnectionDataInterface, message: MessageType, payload: T) {
    this.connection = connection;
    this.message = message;
    this.payload = payload;
  }
}

export default WsMessage;
