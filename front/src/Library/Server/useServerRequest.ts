import {useCallback, useEffect, useRef, useState} from 'react';
import EventBus from '../EventBus/EventBus';
import WebsocketReceivedAMessage from '../WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../WebSocket/Interface/MessageInterface';
import MessageType from '../WebSocket/Enum/MessageType';
import CommandType from '../WebSocket/Enum/CommandType';
import ConnectionManager from '../Connection/ConnectionManager';
import ConnectionDataInterface from '../Connection/Interface/ConnectionDataInterface';

/** command of server tab - answer is message with the same tabId */
export const sendServerCommand = (connection: ConnectionDataInterface, command: CommandType, payload: any) => {
  ConnectionManager.getInstance().sendCommand(connection, command, payload);
};

/**
 * Data of server asked by command, answered by message of given type.
 * load - ask again (with optional payload); every answer replaces data.
 */
const useServerRequest = <T>(
  connection: ConnectionDataInterface,
  tabId: string,
  command: CommandType,
  messageType: MessageType,
  options: {auto?: boolean, onData?: (data: T) => void} = {},
) => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const onDataRef = useRef(options.onData);
  onDataRef.current = options.onData;

  const load = useCallback((payload: any = {}) => {
    setLoading(true);
    sendServerCommand(connection, command, {...payload, tabId});
  }, [connection, command, tabId]);

  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.payload?.tabId !== tabId) return;
      if (message.message === messageType) {
        setData(message.payload as T);
        setError(null);
        setLoading(false);
        onDataRef.current?.(message.payload as T);
      } else if (message.message === MessageType.QUERY_ERROR) {
        setError(message.payload.error);
        setLoading(false);
      }
    });
    if (options.auto !== false) {
      load();
    }
    return () => EventBus.unSub(eventId);
  }, [tabId, messageType]);

  return {data, error, loading, load};
};

export default useServerRequest;
