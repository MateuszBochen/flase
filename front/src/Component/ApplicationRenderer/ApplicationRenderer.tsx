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
import ThemeManager from '../../Library/Theme/ThemeManager';
import {SHORTCUT_HELP_EVENT} from '../../Library/Shortcuts/Shortcuts';
import SqlConsole, {SqlConsolePropsInterface} from '../Application/SqlConsole/SqlConsole';

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
      // tab opened by explicit action is shown at once, links opened "in new tab" stay in background
      if (tab.getData().activate) {
        newContext.lastOpenTab = context.currentTab;
        newContext.currentTab = newContext.tabs.length - 1;
      }
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


  /** global shortcuts - tabs, console, theme, help (list in Library/Shortcuts) */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        event.preventDefault();
        window.dispatchEvent(new Event(SHORTCUT_HELP_EVENT));
        return;
      }
      if (!event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }
      const count = context.tabs.length;
      const key = event.key.toLowerCase();
      let handled = true;
      if (event.key === 'ArrowRight' && !event.shiftKey) {
        EventBus.emit(new CurrentTabWasChanged((context.currentTab + 1) % count));
      } else if (event.key === 'ArrowLeft' && !event.shiftKey) {
        EventBus.emit(new CurrentTabWasChanged((context.currentTab - 1 + count) % count));
      } else if (/^Digit[1-9]$/.test(event.code) && !event.shiftKey) {
        const number = Number(event.code.slice(5));
        EventBus.emit(new CurrentTabWasChanged(number === 9 ? count - 1 : Math.min(number - 1, count - 1)));
      } else if (key === 'w' && !event.shiftKey) {
        EventBus.emit(new TabWasClosed(context.currentTab));
      } else if (key === 'd' && event.shiftKey) {
        ThemeManager.toggle();
      } else if (key === 't' && !event.shiftKey) {
        const connection = (context.tabs[context.currentTab]?.props as any)?.connection;
        const database = (context.tabs[context.currentTab]?.props as any)?.database;
        if (connection) {
          EventBus.emit(new NewTabComponentWasSelected<SqlConsolePropsInterface>({
            component: SqlConsole,
            props: {connection, database: typeof database === 'string' ? database : database?.name ?? null},
            tabName: `Console: ${connection.displayName}`,
            isActive: false,
            activate: true,
          }));
        } else {
          handled = false;
        }
      } else {
        handled = false;
      }
      if (handled) {
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [context]);

  /** memo destructor */
  const value = useMemo(() => {
    return {
      ...context,
    }
  }, [context]);


  return (
    <ApplicationRendererContext.Provider value={value}>
      <Box maxPossibleHeight={true}>
        <TabRender/>
        <ApplicationRender/>
      </Box>
    </ApplicationRendererContext.Provider>
  );
}
