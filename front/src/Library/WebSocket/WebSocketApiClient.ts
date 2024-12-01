import EstablishedConnectionInterface from '../Connection/Interface/EstablishedConnectionInterface';
import BaseRequest from '../API/Request/BaseRequest';
import EventBus from '../EventBus/EventBus';
import WebsocketConnectionWasClosed from './Event/WebsocketConnectionWasClosed';
import CommandInterface from './Interface/CommandInterface';
import WebsocketReceivedAMessage from './Event/WebsocketReceivedAMessage';
import MessageInterface from './Interface/MessageInterface';



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

    this._nativeWebSocketClient.onmessage = (event) => {
      EventBus.emit(new WebsocketReceivedAMessage<any>(JSON.parse(event.data) as MessageInterface<any>));
    }
  }

  sendCommand<T> (command: CommandInterface<T>) {
    const json = JSON.stringify(command);
    this._nativeWebSocketClient.send(json);
  }
}

export default WebSocketApiClient;
