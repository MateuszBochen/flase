import {useEffect, useState} from 'react';
import EventBus from '../EventBus/EventBus';
import ConnectionWasUpdated from './Event/ConnectionWasUpdated';
import ConnectionDataInterface from './Interface/ConnectionDataInterface';
import EventInterface from '../EventBus/EventInterface';

/** component is rendered again when settings of its connection (read only, color) change */
const useConnectionSettings = (connection: ConnectionDataInterface): ConnectionDataInterface => {
  const [, setVersion] = useState<number>(0);
  useEffect(() => {
    const eventId = EventBus.subscribe(ConnectionWasUpdated.name, (event: EventInterface<ConnectionDataInterface>) => {
      if (event.getData().id === connection.id) {
        setVersion((version) => version + 1);
      }
    });
    return () => EventBus.unSub(eventId);
  }, [connection.id]);
  return connection;
};

export default useConnectionSettings;
