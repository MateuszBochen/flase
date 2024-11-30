import VerticalSlider from '../../UI/VerticalSlider/VerticalSlider';
import VerticalSliderItem from '../../UI/VerticalSlider/Interface/VerticalSliderItem';
import {useEffect, useState} from 'react';
import ConnectionSettings from '../../Library/Connection/ConnectionSettings';
import EventBus from '../../Library/EventBus/EventBus';
import NewConnectionWasAdded from '../../Library/Connection/Event/NewConnectionWasAdded';
import EventInterface from '../../Library/EventBus/EventInterface';
import ConnectionDataInterface from '../../Library/Connection/Interface/ConnectionDataInterface';
import ConnectionMenu from '../ConnectionMenu/ConnectionMenu';

/** ConnectionList */
export default () => {
  const connectionSettings = ConnectionSettings.getInstance();

  const [state, setState] = useState<VerticalSliderItem[]>(connectionSettings.getConnections().map((connectionItem) => {
    return {
      label: connectionItem.displayName,
      component: (<ConnectionMenu connectionData={connectionItem} />),
    }
  }));

  useEffect(() => {
    EventBus.subscribe(NewConnectionWasAdded.name, (newItemEvent: EventInterface<ConnectionDataInterface>) => {
      const newState = [...state];
      newState.push({
        label: newItemEvent.getData().displayName,
        component: (<ConnectionMenu connectionData={newItemEvent.getData()} />),
      });
      setState(newState);
    });
  }, [state]);

  return (
    <VerticalSlider
      items={state}
    />
  );
}
