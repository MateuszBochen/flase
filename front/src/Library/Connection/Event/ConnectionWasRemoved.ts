import EventInterface from '../../EventBus/EventInterface';
import ConnectionDataInterface from '../Interface/ConnectionDataInterface';

/** saved connection was deleted - its tabs are closed */
class ConnectionWasRemoved implements EventInterface<ConnectionDataInterface> {
  constructor(private readonly data: ConnectionDataInterface) {
  }

  getData(): ConnectionDataInterface {
    return this.data;
  }
}

export default ConnectionWasRemoved;
