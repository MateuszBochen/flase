import {useCallback, useContext, useEffect, useState} from 'react';
import ConnectionSettings from '../../../Library/Connection/ConnectionSettings';
import ConnectionWasUpdated from '../../../Library/Connection/Event/ConnectionWasUpdated';
import {ApplicationRendererContext} from '../API/Context/ApplicationRendererContext';
import TabLabelList from '../../../UI/TabLabelList/TabLabelList';
import EventBus from '../../../Library/EventBus/EventBus';
import CurrentTabWasChanged from '../Event/CurrentTabWasChanged';
import TabWasClosed from '../Event/TabWasClosed';


export default () => {
  const context = useContext(ApplicationRendererContext);
  const [, setVersion] = useState<number>(0);

  // color of connection changed
  useEffect(() => {
    const eventId = EventBus.subscribe(ConnectionWasUpdated.name, () => setVersion((version) => version + 1));
    return () => EventBus.unSub(eventId);
  }, []);

  /** tabs of colored connection (e.g. production) have the same color */
  const colors = context.tabs.map((tabItem) => {
    const connectionId = (tabItem.props as any)?.connection?.id;
    return connectionId ? ConnectionSettings.getInstance().getConnection(connectionId)?.color : undefined;
  });

  const getListOfLabels = useCallback(():string[] => {
    return context.tabs.map((tabItem) => tabItem.tabName);
  }, [context.tabs]);

  /** handler for switch tab */
  const switchTabHandler = useCallback((tabIndex: number) => {
    EventBus.emit(new CurrentTabWasChanged(tabIndex));
  }, [context.tabs]);

  /** handler for close tab */
  const closeTabHandler = useCallback((tabIndex: number) => {
    EventBus.emit(new TabWasClosed(tabIndex));
  }, [context.tabs]);

  return (
    <TabLabelList
      labels={getListOfLabels()}
      colors={colors}
      activeIndex={context.currentTab}
      onLabelClick={switchTabHandler}
      onLabelClose={closeTabHandler}
    />
  );
}

