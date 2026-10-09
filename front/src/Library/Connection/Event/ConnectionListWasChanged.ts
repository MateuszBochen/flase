import EventInterface from '../../EventBus/EventInterface';

/** list of connections changed as a whole (e.g. connections defined by server were loaded) */
class ConnectionListWasChanged implements EventInterface<null> {
  getData(): null {
    return null;
  }
}

export default ConnectionListWasChanged;
