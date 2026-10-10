import EventInterface from '../../EventBus/EventInterface';
import ReceivedDatabase from '../Interface/ReceivedDatabase';

class DatabaseWasReceived implements EventInterface<ReceivedDatabase>{
  private readonly data: ReceivedDatabase;

  constructor(data: ReceivedDatabase) {
    this.data = data;
  }

  getData(): ReceivedDatabase {
    return this.data;
  }
}

export default DatabaseWasReceived;
