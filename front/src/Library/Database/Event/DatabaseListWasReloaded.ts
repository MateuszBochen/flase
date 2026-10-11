import EventInterface from '../../EventBus/EventInterface';
import ConnectionDataInterface from '../../Connection/Interface/ConnectionDataInterface';

/** list of databases of connection was cleared and asked again (database was created, renamed or dropped) */
class DatabaseListWasReloaded implements EventInterface<ConnectionDataInterface> {
  private readonly data: ConnectionDataInterface;

  constructor(data: ConnectionDataInterface) {
    this.data = data;
  }

  getData(): ConnectionDataInterface {
    return this.data;
  }
}

export default DatabaseListWasReloaded;
