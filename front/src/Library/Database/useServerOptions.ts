import {useEffect, useState} from 'react';
import EventBus from '../EventBus/EventBus';
import WebsocketReceivedAMessage from '../WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../WebSocket/Interface/MessageInterface';
import MessageType from '../WebSocket/Enum/MessageType';
import ConnectionDataInterface from '../Connection/Interface/ConnectionDataInterface';
import {ServerOptionsInterface} from './Interface/DatabaseObjectsInterface';
import DatabaseOperations from './DatabaseOperations';

/** collations and engines do not change while application is open - loaded once per connection */
const cache = new Map<string, ServerOptionsInterface>();

/** collations and storage engines of server for forms, null while loading */
const useServerOptions = (connection: ConnectionDataInterface): ServerOptionsInterface | null => {
  const [options, setOptions] = useState<ServerOptionsInterface | null>(cache.get(connection.id) || null);

  useEffect(() => {
    if (cache.has(connection.id)) {
      setOptions(cache.get(connection.id)!);
      return;
    }
    const tabId = `server-options:${connection.id}`;
    const eventId = EventBus.subscribe<MessageInterface<ServerOptionsInterface>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.payload?.tabId !== tabId) return;
      if (message.message === MessageType.SERVER_OPTIONS) {
        cache.set(connection.id, message.payload);
        setOptions(message.payload);
      } else if (message.message === MessageType.QUERY_ERROR) {
        // forms work without choices
        setOptions({collations: [], engines: [], defaultCollation: null});
      }
    });
    DatabaseOperations.serverOptions(connection, tabId);
    return () => EventBus.unSub(eventId);
  }, [connection.id]);

  return options;
};

export default useServerOptions;
