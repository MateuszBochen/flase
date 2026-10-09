import VerticalSlider from '../../UI/VerticalSlider/VerticalSlider';
import VerticalSliderItem from '../../UI/VerticalSlider/Interface/VerticalSliderItem';
import {useEffect, useState} from 'react';
import ConnectionSettings from '../../Library/Connection/ConnectionSettings';
import EventBus from '../../Library/EventBus/EventBus';
import NewConnectionWasAdded from '../../Library/Connection/Event/NewConnectionWasAdded';
import EventInterface from '../../Library/EventBus/EventInterface';
import ConnectionDataInterface from '../../Library/Connection/Interface/ConnectionDataInterface';
import ConnectionMenu from '../ConnectionMenu/ConnectionMenu';
import ConnectionWasUpdated from '../../Library/Connection/Event/ConnectionWasUpdated';
import ConnectionWasRemoved from '../../Library/Connection/Event/ConnectionWasRemoved';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faLock} from '@fortawesome/free-solid-svg-icons';

/** ConnectionList */
export default () => {
  const connectionSettings = ConnectionSettings.getInstance();

  const toItem = (connectionItem: ConnectionDataInterface): VerticalSliderItem => ({
    id: connectionItem.id,
    label: connectionItem.displayName,
    color: connectionItem.color,
    suffix: connectionItem.readOnly
      ? <span className="connection-read-only" title="Read only connection"><FontAwesomeIcon icon={faLock} /></span>
      : null,
    component: (<ConnectionMenu connectionData={connectionItem} />),
  });

  const [state, setState] = useState<VerticalSliderItem[]>(connectionSettings.getConnections().map(toItem));

  // name, color and read only of connection changed - items are built again
  useEffect(() => {
    const rebuild = () => setState(connectionSettings.getConnections().map(toItem));
    const updatedId = EventBus.subscribe(ConnectionWasUpdated.name, rebuild);
    const removedId = EventBus.subscribe(ConnectionWasRemoved.name, rebuild);
    return () => {
      EventBus.unSub(updatedId);
      EventBus.unSub(removedId);
    };
  }, []);

  useEffect(() => {
    const newConnectionWasAddedSubscriber = EventBus.subscribe(NewConnectionWasAdded.name, (newItemEvent: EventInterface<ConnectionDataInterface>) => {
      const newState = [...state];
      newState.push(toItem(newItemEvent.getData()));
      setState(newState);
    });

    return () => {
      EventBus.unSub(newConnectionWasAddedSubscriber);
    }

  }, [state]);

  return (
    // servers are opened / closed by user, more of them can be open at once
    <VerticalSlider
      items={state}
      multiple
      storageKey="open-connections"
    />
  );
}
