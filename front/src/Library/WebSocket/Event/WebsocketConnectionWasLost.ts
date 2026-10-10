import EventInterface from '../../EventBus/EventInterface';
import EstablishedConnectionInterface from '../../Connection/Interface/EstablishedConnectionInterface';

/**
 * trigger when websocket was disconnected unexpectedly, client is reconnecting
 * @author Mateusz Bochen
 */
class WebsocketConnectionWasLost implements EventInterface<EstablishedConnectionInterface> {
  private readonly data: EstablishedConnectionInterface;

  constructor(data: EstablishedConnectionInterface) {
    this.data = data;
  }

  getData(): EstablishedConnectionInterface {
    return this.data;
  }
}

export default WebsocketConnectionWasLost;
