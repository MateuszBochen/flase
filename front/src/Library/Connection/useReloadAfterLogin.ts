import {useEffect, useRef} from 'react';
import EventBus from '../EventBus/EventBus';
import ConnectionManager from './ConnectionManager';
import ConnectionWasEstablished from './Event/ConnectionWasEstablished';
import ConnectionDataInterface from './Interface/ConnectionDataInterface';

/**
 * Tab whose command failed because its connection is not logged in (session expired after restart of server)
 * loads again when the connection is logged in. Returned function marks the tab as waiting.
 */
const useReloadAfterLogin = (connection: ConnectionDataInterface, reload: () => void): () => void => {
  const waiting = useRef(false);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    const eventId = EventBus.subscribe(ConnectionWasEstablished.name, () => {
      if (waiting.current && ConnectionManager.getInstance().checkIfConnectionIsActive(connection)) {
        waiting.current = false;
        reloadRef.current();
      }
    });
    return () => EventBus.unSub(eventId);
  }, [connection.id]);

  return () => {
    waiting.current = true;
  };
};

export default useReloadAfterLogin;
