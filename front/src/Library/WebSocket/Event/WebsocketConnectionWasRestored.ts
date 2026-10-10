import EventInterface from '../../EventBus/EventInterface';
import EstablishedConnectionInterface from '../../Connection/Interface/EstablishedConnectionInterface';

/**
 * trigger when websocket was connected again after it was lost
 * @author Mateusz Bochen
 */
class WebsocketConnectionWasRestored implements EventInterface<EstablishedConnectionInterface> {
  private readonly data: EstablishedConnectionInterface;

  constructor(data: EstablishedConnectionInterface) {
    this.data = data;
  }

  getData(): EstablishedConnectionInterface {
    return this.data;
  }
}

export default WebsocketConnectionWasRestored;
