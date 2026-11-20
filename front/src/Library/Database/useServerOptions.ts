import {useEffect, useState} from 'react';
import TabMessages from '../WebSocket/TabMessages';
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
    const unsubscribe = TabMessages.subscribe<ServerOptionsInterface>(tabId, (message) => {
      if (message.message === MessageType.SERVER_OPTIONS) {
        cache.set(connection.id, message.payload);
        setOptions(message.payload);
      } else if (message.message === MessageType.QUERY_ERROR) {
        // forms work without choices
        setOptions({collations: [], engines: [], defaultCollation: null});
      }
    });
    DatabaseOperations.serverOptions(connection, tabId);
    return () => unsubscribe();
  }, [connection.id]);

  return options;
};

export default useServerOptions;
