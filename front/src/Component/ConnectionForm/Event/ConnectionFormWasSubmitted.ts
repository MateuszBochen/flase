import EventInterface from '../../../Library/EventBus/EventInterface';
import ConnectionRequestInterface from '../../../Library/Connection/Interface/ConnectionRequestInterface';

class ConnectionFormWasSubmitted implements EventInterface<ConnectionRequestInterface> {

  data: ConnectionRequestInterface;

  constructor(data: ConnectionRequestInterface) {
    this.data = data;
  }

  getData(): ConnectionRequestInterface {
    return this.data;
  }

}

export default ConnectionFormWasSubmitted;
