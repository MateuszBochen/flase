import EventInterface from './EventInterface';
import {v4 as uuidv4} from 'uuid';
import LoopThrough from '../Loop/LoopThrough';
type typeHandler = (event: EventInterface<any>) => void;

type TypeSubscriptionItem = {
  hash: string,
  handler: typeHandler,
}

class EventBus {

  private static instance: EventBus;

  public static getInstance(): EventBus
  {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }

    return EventBus.instance;
  }

  events : {[key:string]: TypeSubscriptionItem[] } = {};

  emit = <T>(event: EventInterface<T>) => {
    const handlers = this.events[event.constructor.name];

    if (!handlers || !handlers.length) {
      return;
    }

    handlers.forEach((handler) => handler.handler(event));
  }

  subscribe = <T>(name:string, handler: (event: EventInterface<T>) => void): string => {
    if (!this.events[name]) {
      this.events[name] = [];
    }

    const hash = uuidv4();

    const filtered = this.events[name].filter((handlerItem) => {
      return handlerItem.hash === hash
    });

    if (filtered.length) {
      filtered.forEach((handlerItem) => {
        handlerItem.handler = handler;
      });
    } else {
      this.events[name].push({
        handler,
        hash,
      });
    }

    return hash;
  }

  unSub(hash: string): void {
    for (const [key, value] of Object.entries(this.events)) {
      const handlers = this.events[key];
      this.events[key] = handlers.filter((handlerItem) => {
        return handlerItem.hash !== hash
      });
    }
  }
}

export default EventBus.getInstance();
