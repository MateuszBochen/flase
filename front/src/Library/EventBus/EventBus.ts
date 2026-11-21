import EventInterface from './EventInterface';
import {v4 as uuidv4} from 'uuid';

type HandlerType = (event: EventInterface<any>) => void;

/** class of event - handlers are found by the class itself, its name is shortened in production build */
export type EventClassType<T = any> = abstract new (...args: any[]) => EventInterface<T>;

class EventBus {

  private static instance: EventBus;

  public static getInstance(): EventBus
  {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }

    return EventBus.instance;
  }

  private readonly handlers = new Map<Function, Map<string, HandlerType>>();
  /** event class of subscription - unSub does not search all events */
  private readonly subscriptions = new Map<string, Function>();

  /** block constructor */
  private constructor() {
  }

  emit = <T>(event: EventInterface<T>) => {
    const handlers = this.handlers.get(event.constructor);
    if (!handlers || !handlers.size) {
      return;
    }
    // copy - handler may unsubscribe (one answer) or subscribe while it runs
    Array.from(handlers.values()).forEach((handler) => handler(event));
  }

  /** returns id for unSub */
  subscribe = <T>(eventClass: EventClassType, handler: (event: EventInterface<T>) => void): string => {
    let handlers = this.handlers.get(eventClass);
    if (!handlers) {
      handlers = new Map();
      this.handlers.set(eventClass, handlers);
    }
    const hash = uuidv4();
    handlers.set(hash, handler);
    this.subscriptions.set(hash, eventClass);
    return hash;
  }

  unSub(hash: string): void {
    const eventClass = this.subscriptions.get(hash);
    if (!eventClass) {
      return;
    }
    this.subscriptions.delete(hash);
    const handlers = this.handlers.get(eventClass);
    handlers?.delete(hash);
    if (handlers && !handlers.size) {
      this.handlers.delete(eventClass);
    }
  }
}

export default EventBus.getInstance();
