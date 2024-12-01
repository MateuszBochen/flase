import EstablishedConnectionInterface from '../Connection/Interface/EstablishedConnectionInterface';
import BaseRequest from '../API/Request/BaseRequest';
import EventBus from '../EventBus/EventBus';
import WebsocketConnectionWasClosed from './Event/WebsocketConnectionWasClosed';



class WebSocketApiClient {
  private connectionData: EstablishedConnectionInterface;
  private _nativeWebSocketClient: WebSocket;

  constructor(connectionData: EstablishedConnectionInterface) {
    this.connectionData = connectionData;
    const url = `${BaseRequest.WS_URL}/ws/${connectionData.user.token}`;
    this._nativeWebSocketClient = new WebSocket(url);


    this._nativeWebSocketClient.onopen = (event) => {
      console.log('connection opened successfully');
    }

   /* this._nativeWebSocketClient.onerror = (event) => {
      EventBus.emit(new WebsocketConnectionWasClosed(connectionData));
    }*/

    this._nativeWebSocketClient.onclose = (event) => {
      EventBus.emit(new WebsocketConnectionWasClosed(connectionData));
    }
  }
}

export default WebSocketApiClient;
