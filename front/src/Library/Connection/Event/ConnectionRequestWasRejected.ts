import EventInterface from '../../EventBus/EventInterface';


class ConnectionRequestWasRejected implements EventInterface<undefined> {
  getData(): undefined {
    return undefined;
  }
}

export default ConnectionRequestWasRejected;
