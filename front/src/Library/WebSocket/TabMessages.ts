import EventBus from '../EventBus/EventBus';
import WebsocketReceivedAMessage from './Event/WebsocketReceivedAMessage';
import MessageInterface from './Interface/MessageInterface';
import EventInterface from '../EventBus/EventInterface';

type HandlerType<T> = (message: MessageInterface<T>) => void;

/**
 * Websocket messages by tabId of their payload. Handler gets only messages of its tab - cost of message does not grow
 * with count of open tabs. Messages without tabId (lists of databases / tables) stay for EventBus subscribers.
 */
class TabMessages {
  private readonly handlers = new Map<string, Set<HandlerType<any>>>();
  /** handlers of tab and its results (`${tabId}:N` of console statements) */
  private readonly treeHandlers = new Map<string, Set<HandlerType<any>>>();
  private listening = false;

  /** messages of exactly this tab - returns unsubscribe */
  subscribe<T = any>(tabId: string, handler: HandlerType<T>): () => void {
    return this.add(this.handlers, tabId, handler);
  }

  /** messages of tab and of tabs `${tabId}:...` - returns unsubscribe */
  subscribeTree<T = any>(tabId: string, handler: HandlerType<T>): () => void {
    return this.add(this.treeHandlers, tabId, handler);
  }

  private add(map: Map<string, Set<HandlerType<any>>>, tabId: string, handler: HandlerType<any>): () => void {
    this.listen();
    let set = map.get(tabId);
    if (!set) {
      set = new Set();
      map.set(tabId, set);
    }
    set.add(handler);
    return () => {
      const current = map.get(tabId);
      if (!current) return;
      current.delete(handler);
      if (!current.size) map.delete(tabId);
    };
  }

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage, (event: EventInterface<MessageInterface<any>>) => {
      this.dispatch(event.getData());
    });
  }

  private dispatch(message: MessageInterface<any>): void {
    const tabId: unknown = message.payload?.tabId;
    if (typeof tabId !== 'string' || !tabId) return;
    // copy - handler may unsubscribe (one answer) or subscribe while it runs
    const exact = this.handlers.get(tabId);
    if (exact) Array.from(exact).forEach((handler) => handler(message));
    if (!this.treeHandlers.size) return;
    for (let end = tabId.length; end > 0; end = tabId.lastIndexOf(':', end - 1)) {
      const set = this.treeHandlers.get(tabId.substring(0, end));
      if (set) Array.from(set).forEach((handler) => handler(message));
    }
  }
}

const tabMessages = new TabMessages();

export default tabMessages;
