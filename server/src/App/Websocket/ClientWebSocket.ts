import MessageInterface from './Interface/MessageInterface';

class ClientWebSocket {
  nativeWebsocketClient: WebSocket;
  constructor(nativeWebsocketClient: WebSocket) {
    this.nativeWebsocketClient = nativeWebsocketClient;
  }

  send<T>(data: MessageInterface<T>): void {
    const json = JSON.stringify(data);
    this.nativeWebsocketClient.send(json);
  }
}
export default ClientWebSocket;
