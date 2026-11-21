import MessageInterface from './Interface/MessageInterface';

/** checks of full send buffer - ws has no drain event of its own */
const DRAIN_POLL_MS = 10;

class ClientWebSocket {
  nativeWebsocketClient: WebSocket;
  constructor(nativeWebsocketClient: WebSocket) {
    this.nativeWebsocketClient = nativeWebsocketClient;
  }

  send<T>(data: MessageInterface<T>): void {
    const json = JSON.stringify(data);
    this.nativeWebsocketClient.send(json);
  }

  /** bytes waiting to be sent to client */
  bufferedAmount(): number {
    return this.nativeWebsocketClient.bufferedAmount || 0;
  }

  /** resolves when at most lowWater bytes wait for client - or socket is closed (nothing waits for it then) */
  whenDrained(lowWater: number): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (this.nativeWebsocketClient.readyState !== this.nativeWebsocketClient.OPEN || this.bufferedAmount() <= lowWater) {
          resolve();
          return;
        }
        setTimeout(check, DRAIN_POLL_MS);
      };
      check();
    });
  }
}
export default ClientWebSocket;
