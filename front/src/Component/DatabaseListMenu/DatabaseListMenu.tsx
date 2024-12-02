import DatabaseManger from '../../Library/Database/DatabaseManger';
import {useCallback, useEffect, useState} from 'react';
import ConnectionManager from '../../Library/Connection/ConnectionManager';
import DatabaseListMenuPropsInterface from './DatabaseListMenuPropsInterface';
import EventBus from '../../Library/EventBus/EventBus';
import DatabaseWasReceived from '../../Library/Database/Event/DatabaseWasReceived';
import VerticalSliderItem from '../../UI/VerticalSlider/Interface/VerticalSliderItem';
import VerticalSlider from '../../UI/VerticalSlider/VerticalSlider';
import TableListMenu from '../TableListMenu/TableListMenu';

const connectionManger = ConnectionManager.getInstance();
const databaseManger = DatabaseManger.getInstance();

/** DatabaseListMenu */
export default (props: DatabaseListMenuPropsInterface) => {
  const [state, setState] = useState<VerticalSliderItem[]>([]);

  const convertToVerticalSliderItem = useCallback(() => {
    const establishedConnection = connectionManger.getEstablishedConnection(props.connection);
    const list = databaseManger.getListOfDatabaseForConnection(establishedConnection);

    setState(list.map((databaseItem) => {
      return {
        label: databaseItem.name,
        component: <TableListMenu connection={props.connection} database={databaseItem} key={databaseItem.name} />
      };
    }));

  }, [props, state]);

  useEffect(() => {
    console.log('DatabaseListMenu');
    try {
      convertToVerticalSliderItem();
    } catch (e) {}
  }, []);

  useEffect(() => {
    const databaseWasReceivedSubscriber = EventBus.subscribe(DatabaseWasReceived.name, () => {
      try {
        convertToVerticalSliderItem();
      } catch (e) {}
    });

    return () => {
      EventBus.unSub(databaseWasReceivedSubscriber);
    }

  }, [props, state]);

  if (state.length === 0) {
    return null;
  }

  return (
    <VerticalSlider
      items={state}
      allowClose={true}
      automateOpenFirst={false}
    />
  );
}
