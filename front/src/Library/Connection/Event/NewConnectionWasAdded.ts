import EventInterface from '../../EventBus/EventInterface';
import ConnectionDataInterface from '../Interface/ConnectionDataInterface';


class NewConnectionWasAdded implements EventInterface<ConnectionDataInterface> {

  private readonly data: ConnectionDataInterface;


  constructor(data: ConnectionDataInterface) {
    this.data = data;
  }

  getData(): ConnectionDataInterface {
    return this.data;
  }
}

export default NewConnectionWasAdded;
