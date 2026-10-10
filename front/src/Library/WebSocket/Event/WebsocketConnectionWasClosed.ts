import EventInterface from '../../EventBus/EventInterface';
import EstablishedConnectionInterface from '../../Connection/Interface/EstablishedConnectionInterface';

/**
 * trigger when websocket was closed for good - session expired or does not exist, user must log in again
 * @author Mateusz Bochen
 */
class WebsocketConnectionWasClosed implements EventInterface<EstablishedConnectionInterface> {
  private readonly data: EstablishedConnectionInterface;

  constructor(data: EstablishedConnectionInterface) {
    this.data = data;
  }

  getData(): EstablishedConnectionInterface {
    return this.data;
  }
}


export default WebsocketConnectionWasClosed;
