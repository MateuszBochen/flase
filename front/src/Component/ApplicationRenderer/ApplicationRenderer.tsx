import ApplicationRendererPropsInterface from './Interface/ApplicationRendererPropsInterface';
import {ApplicationRendererContext} from './API/Context/ApplicationRendererContext';
import TabRender from './UI/TabRender';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import ApplicationRendererContextInterface from './Interface/ApplicationRendererContextInterface';
import defaultApplicationRendererContext from './API/Context/defaultApplicationRendererContext';
import ApplicationRender from './UI/ApplicationRender';
import Box from '../../UI/Box/Box';
import EventBus from '../../Library/EventBus/EventBus';
import TabInterface from './Interface/TabInterface';
import CurrentTabComponentWasSelected from './Event/CurrentTabComponentWasSelected';
import EventInterface from '../../Library/EventBus/EventInterface';
import NewTabComponentWasSelected from './Event/NewTabComponentWasSelected';
import CurrentTabWasChanged from './Event/CurrentTabWasChanged';
import {v4 as uuidv4} from 'uuid';
import TabWasClosed from './Event/TabWasClosed';

/**
 * ApplicationRenderer
 * @author Mateusz Bochen
 */
export default (props: ApplicationRendererPropsInterface) => {
  const [context, setContext] = useState<ApplicationRendererContextInterface>({
    ...defaultApplicationRendererContext,
    tabs: [{
        ...props.defaultTab,
        id: uuidv4(),
    }],
  });

  useEffect(() => {

    /** Open component in same tab */
    const currentTabComponentWasSelectedSubscriber = EventBus.subscribe<TabInterface<any>>(CurrentTabComponentWasSelected.name, (tab: EventInterface<TabInterface<any>>) => {
      const currentTabIndex = context.currentTab;
      const newContext = {...context};
      newContext.tabs[currentTabIndex] = { ...tab.getData(), id: uuidv4()};
      setContext(newContext);
    });

    /** Add new tab to tab list, no render */
    const newTabComponentWasSelectedSubscriber = EventBus.subscribe<TabInterface<any>>(NewTabComponentWasSelected.name, (tab: EventInterface<TabInterface<any>>) => {
      const newContext = {...context};
      newContext.tabs.push({ ...tab.getData(), id: uuidv4()});
      setContext(newContext);
    });

    /** current tab was changed */
    const currentTabWasChangedSubscriber = EventBus.subscribe<number>(CurrentTabWasChanged.name, (newTabIndex: EventInterface<number>) => {
      const currentTabIndex = context.currentTab;
      if (currentTabIndex !== newTabIndex.getData()) {
        setContext({
          ...context,
          currentTab: newTabIndex.getData(),
          lastOpenTab: currentTabIndex,
        });
      }
    });

    /** handle closing tab */
    const tabWasClosedSubscriber = EventBus.subscribe(TabWasClosed.name, (tabToCloseEvent: EventInterface<number>) => {
      if (context.tabs.length > 1) {
        const tabToClose = tabToCloseEvent.getData();
        const newTabs = context.tabs.filter((tabItem, index) => index !== tabToClose);
        const newContext = {
          ...context,
          tabs: newTabs,
        };

        // if close active tab, back to last open tab
        if (context.currentTab === tabToClose) {
          newContext.currentTab = context.lastOpenTab >= 0 ? context.lastOpenTab : tabToClose -1;
          newContext.lastOpenTab = -1;
        } else {
          if (tabToClose < context.currentTab) {
            newContext.currentTab = context.currentTab - 1;
            newContext.lastOpenTab = context.lastOpenTab - 1;
          }
        }
        setContext(newContext);
      }
    });

    return () => {
      EventBus.unSub(currentTabComponentWasSelectedSubscriber);
      EventBus.unSub(newTabComponentWasSelectedSubscriber);
      EventBus.unSub(currentTabWasChangedSubscriber);
      EventBus.unSub(tabWasClosedSubscriber);
    }

  }, [context]);


  /** memo destructor */
  const value = useMemo(() => {
    return {
      ...context,
    }
  }, [context]);


  return (
    <ApplicationRendererContext.Provider value={value}>
      <Box>
        <TabRender/>
        <ApplicationRender/>
      </Box>
    </ApplicationRendererContext.Provider>
  );
}
