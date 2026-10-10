import EventInterface from '../../EventBus/EventInterface';

class ConnectionWasEstablished implements EventInterface<undefined>{
  getData(): undefined {
    return undefined;
  }

}

export default ConnectionWasEstablished;
