import {useCallback, useContext} from 'react';
import {ApplicationRendererContext} from '../API/Context/ApplicationRendererContext';
import TabLabelList from '../../../UI/TabLabelList/TabLabelList';
import EventBus from '../../../Library/EventBus/EventBus';
import CurrentTabWasChanged from '../Event/CurrentTabWasChanged';
import TabWasClosed from '../Event/TabWasClosed';


export default () => {
  const context = useContext(ApplicationRendererContext);

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
      activeIndex={context.currentTab}
      onLabelClick={switchTabHandler}
      onLabelClose={closeTabHandler}
    />
  );
}

