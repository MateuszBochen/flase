import ConnectionDataInterface from '../../Connection/Interface/ConnectionDataInterface';
import MessageType from '../Enum/MessageType';

interface MessageInterface<T> {
  connection: ConnectionDataInterface;
  message: MessageType;
  payload: T;
}
export default MessageInterface;
