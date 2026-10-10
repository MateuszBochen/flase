import EventInterface from '../../EventBus/EventInterface';
import ConnectionDataInterface from '../Interface/ConnectionDataInterface';

/** settings of connection (name, color, read only) were changed */
class ConnectionWasUpdated implements EventInterface<ConnectionDataInterface> {
  constructor(private readonly data: ConnectionDataInterface) {
  }

  getData(): ConnectionDataInterface {
    return this.data;
  }
}

export default ConnectionWasUpdated;
