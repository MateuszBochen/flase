import EstablishedConnectionInterface from '../Connection/Interface/EstablishedConnectionInterface';
import BaseRequest from '../API/Request/BaseRequest';
import EventBus from '../EventBus/EventBus';
import WebsocketConnectionWasClosed from './Event/WebsocketConnectionWasClosed';
import CommandInterface from './Interface/CommandInterface';
import WebsocketReceivedAMessage from './Event/WebsocketReceivedAMessage';
import MessageInterface from './Interface/MessageInterface';
import CommandType from './Enum/CommandType';
import MessageType from './Enum/MessageType';
import QueryErrorInterface from '../Record/Interface/QueryErrorInterface';
import WebsocketConnectionWasLost from './Event/WebsocketConnectionWasLost';
import WebsocketConnectionWasRestored from './Event/WebsocketConnectionWasRestored';

/** close code sent by server when session expired or does not exist - reconnecting would not help */
const CLOSE_SESSION_NOT_FOUND = 4001;

/** waiting before next reconnect attempt, the last one is repeated */
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000, 30000];

/** commands with answer for a tab, client must tell the tab when the answer will never come */
const TAB_COMMANDS = [CommandType.SEND_SELECT_QUERY, CommandType.APPLY_ROW_CHANGES];

/**
 * Websocket of one established connection.
 * Lost connection is opened again automatically, commands are queued meanwhile.
 * @author Mateusz Bochen
 */
class WebSocketApiClient {
  private connectionData: EstablishedConnectionInterface;
  private socket: WebSocket | null = null;
  /** commands waiting for connection */
  private queue: CommandInterface<any>[] = [];
  private closedByClient = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  /** tabId -> command waiting for answer */
  private pendingTabCommands = new Map<string, CommandType>();

  constructor(connectionData: EstablishedConnectionInterface) {
    this.connectionData = connectionData;
    window.addEventListener('online', this.reconnectNow);
    this.open();
  }

  sendCommand<T> (command: CommandInterface<T>) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.send(this.socket, command);
    } else {
      // sent after (re)connect
      this.queue.push(command);
    }
  }

  /** close for good, e.g. logout */
  close(): void {
    this.closedByClient = true;
    clearTimeout(this.reconnectTimer);
    window.removeEventListener('online', this.reconnectNow);
    this.socket?.close();
    this.socket = null;
  }

  private open(): void {
    // token can be refreshed meanwhile, always use the current one
    const socket = new WebSocket(`${BaseRequest.WS_URL}/ws/${this.connectionData.user.token}`);
    this.socket = socket;

    socket.onopen = () => {
      const wasReconnect = this.reconnectAttempt > 0;
      this.reconnectAttempt = 0;
      this.queue.splice(0).forEach((command) => this.send(socket, command));
      if (wasReconnect) {
        EventBus.emit(new WebsocketConnectionWasRestored(this.connectionData));
      }
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as MessageInterface<any>;
      if (WebSocketApiClient.isFinalTabMessage(message)) {
        this.pendingTabCommands.delete(message.payload.tabId);
      }
      EventBus.emit(new WebsocketReceivedAMessage<any>(message));
    };

    socket.onclose = (event) => {
      if (this.socket !== socket) {
        return;
      }
      this.socket = null;
      this.failPendingTabCommands();

      if (this.closedByClient) {
        return;
      }
      if (event.code === CLOSE_SESSION_NOT_FOUND) {
        window.removeEventListener('online', this.reconnectNow);
        EventBus.emit(new WebsocketConnectionWasClosed(this.connectionData));
        return;
      }

      if (this.reconnectAttempt === 0) {
        EventBus.emit(new WebsocketConnectionWasLost(this.connectionData));
      }
      this.scheduleReconnect();
    };
  }

  /** only sent commands wait for answer - queued ones are still going to be sent */
  private send(socket: WebSocket, command: CommandInterface<any>): void {
    const tabId = command.payload?.tabId;
    if (tabId && TAB_COMMANDS.includes(command.command)) {
      this.pendingTabCommands.set(tabId, command.command);
    }
    socket.send(JSON.stringify(command));
  }

  private scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
    this.reconnectAttempt++;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  /** network is back - do not wait for next attempt */
  private reconnectNow = () => {
    if (!this.socket && !this.closedByClient && this.reconnectAttempt > 0) {
      clearTimeout(this.reconnectTimer);
      this.open();
    }
  };

  /** answers of commands sent before connection was lost will never come */
  private failPendingTabCommands(): void {
    this.pendingTabCommands.forEach((command, tabId) => {
      const error = command === CommandType.APPLY_ROW_CHANGES
        ? 'Connection to server was lost while saving. Changes may or may not be saved - reload data to check.'
        : 'Connection to server was lost. Run the query again.';

      EventBus.emit(new WebsocketReceivedAMessage<QueryErrorInterface>({
        connection: this.connectionData.connection,
        message: MessageType.QUERY_ERROR,
        payload: {command, error, tabId},
      }));
    });
    this.pendingTabCommands.clear();
  }

  private static isFinalTabMessage(message: MessageInterface<any>): boolean {
    return !!message.payload?.tabId && [
      MessageType.QUERY_FINISHED,
      MessageType.QUERY_ERROR,
      MessageType.ROW_CHANGES_PREVIEW,
      MessageType.ROW_CHANGES_APPLIED,
    ].includes(message.message);
  }
}

export default WebSocketApiClient;
