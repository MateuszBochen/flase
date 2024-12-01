import EventInterface from '../../EventBus/EventInterface';
import MessageInterface from '../Interface/MessageInterface';

class WebsocketReceivedAMessage<T> implements EventInterface<MessageInterface<T>> {
  private readonly message: MessageInterface<T>

  constructor(message: MessageInterface<T>) {
    this.message = message;
  }

  getData(): MessageInterface<T> {
    return this.message;
  }
}

export default WebsocketReceivedAMessage;
