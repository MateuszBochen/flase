import DatabaseManger from '../../Library/Database/DatabaseManger';
import {useEffect, useState} from 'react';
import Database from '../../Library/Database/Interface/Database';
import ConnectionManager from '../../Library/Connection/ConnectionManager';
import DatabaseListMenuPropsInterface from './DatabaseListMenuPropsInterface';
import EventBus from '../../Library/EventBus/EventBus';
import DatabaseWasReceived from '../../Library/Database/Event/DatabaseWasReceived';

const connectionManger = ConnectionManager.getInstance();
const databaseManger = DatabaseManger.getInstance();

/** DatabaseListMenu */
export default (props: DatabaseListMenuPropsInterface) => {
  const [list, setList] = useState<Database[]>([]);

  useEffect(() => {
    try {
      const establishedConnection = connectionManger.getEstablishedConnection(props.connection);
      const list = databaseManger.getListOfDatabaseForConnection(establishedConnection);
      setList([...list]);
    } catch (e) {}
  }, [props]);

  useEffect(() => {
    const databaseWasReceivedSubscriber = EventBus.subscribe(DatabaseWasReceived.name, () => {
      try {
        const establishedConnection = connectionManger.getEstablishedConnection(props.connection);
        const list = databaseManger.getListOfDatabaseForConnection({...establishedConnection});
        setList([...list]);
      } catch (e) {}
    });

    return () => {
      EventBus.unSub(databaseWasReceivedSubscriber);
    }

  }, [props, list]);

  return (
   <div>
     <ul>
       {list.map((item) => <li key={item.name}>{item.name}</li>)}
     </ul>
   </div>
  );
}
