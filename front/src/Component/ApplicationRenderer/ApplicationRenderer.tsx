import ApplicationRendererPropsInterface from './Interface/ApplicationRendererPropsInterface';
import {ApplicationRendererContext} from './API/Context/ApplicationRendererContext';
import TabRender from './UI/TabRender';
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
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
import ConnectionWasRemoved from '../../Library/Connection/Event/ConnectionWasRemoved';
import ConnectionDataInterface from '../../Library/Connection/Interface/ConnectionDataInterface';
import {SHORTCUT_HELP_EVENT} from '../../Library/Shortcuts/Shortcuts';
import SqlConsole, {SqlConsolePropsInterface} from '../Application/SqlConsole/SqlConsole';
import TabPersistence from './TabPersistence';
import OpenTables from '../../Library/Tabs/OpenTables';

/**
 * ApplicationRenderer
 * @author Mateusz Bochen
 */
export default (props: ApplicationRendererPropsInterface) => {
  // tabs of last visit (reload of page), otherwise the default one
  const [context, setContext] = useState<ApplicationRendererContextInterface>(() => TabPersistence.restore() || {
    ...defaultApplicationRendererContext,
    tabs: [{
        ...props.defaultTab,
        id: uuidv4(),
    }],
  });

  useEffect(() => {
    TabPersistence.save(context);
    // sidebar marks tables of open tabs
    OpenTables.publish(context.tabs, context.currentTab);
  }, [context]);

  /**
   * the current state for handlers - more events can come before next render (fast Alt+W), state of closure would be old
   */
  const stateRef = useRef<ApplicationRendererContextInterface>(context);
  const update = useCallback((change: (state: ApplicationRendererContextInterface) => ApplicationRendererContextInterface) => {
    const next = change(stateRef.current);
    if (next === stateRef.current) return;
    // current tab is always one of tabs - otherwise no tab is shown
    stateRef.current = {...next, currentTab: Math.min(Math.max(0, next.currentTab), next.tabs.length - 1)};
    setContext(stateRef.current);
  }, []);

  useEffect(() => {

    /** Open component in same tab */
    const currentTabComponentWasSelectedSubscriber = EventBus.subscribe<TabInterface<any>>(CurrentTabComponentWasSelected.name, (tab: EventInterface<TabInterface<any>>) => {
      update((state) => ({
        ...state,
        tabs: state.tabs.map((tabItem, index) => index === state.currentTab ? {...tab.getData(), id: uuidv4()} : tabItem),
      }));
    });

    /** Add new tab to tab list, no render */
    const newTabComponentWasSelectedSubscriber = EventBus.subscribe<TabInterface<any>>(NewTabComponentWasSelected.name, (tab: EventInterface<TabInterface<any>>) => {
      update((state) => {
        const tabs = [...state.tabs, {...tab.getData(), id: uuidv4()}];
        // tab opened by explicit action is shown at once, links opened "in new tab" stay in background
        return tab.getData().activate
          ? {...state, tabs, lastOpenTab: state.currentTab, currentTab: tabs.length - 1}
          : {...state, tabs};
      });
    });

    /** current tab was changed */
    const currentTabWasChangedSubscriber = EventBus.subscribe<number>(CurrentTabWasChanged.name, (newTabIndex: EventInterface<number>) => {
      update((state) => {
        const index = newTabIndex.getData();
        if (index === state.currentTab || !Number.isInteger(index) || index < 0 || index >= state.tabs.length) {
          return state;
        }
        return {...state, currentTab: index, lastOpenTab: state.currentTab};
      });
    });

    /** handle closing tab */
    const tabWasClosedSubscriber = EventBus.subscribe(TabWasClosed.name, (tabToCloseEvent: EventInterface<number>) => {
      update((state) => {
        const closed = tabToCloseEvent.getData();
        if (state.tabs.length <= 1 || closed < 0 || closed >= state.tabs.length) {
          return state;
        }
        const tabs = state.tabs.filter((tabItem, index) => index !== closed);
        /** index of tab after the closed one was removed, -1 for the closed one */
        const shifted = (index: number) => index === closed ? -1 : index > closed ? index - 1 : index;
        if (state.currentTab === closed) {
          // back to last open tab, otherwise to the tab before
          const last = shifted(state.lastOpenTab);
          return {...state, tabs, currentTab: last >= 0 ? last : Math.max(0, closed - 1), lastOpenTab: -1};
        }
        return {...state, tabs, currentTab: shifted(state.currentTab), lastOpenTab: shifted(state.lastOpenTab)};
      });
    });

    /** tabs of deleted connection are closed, at least one tab stays */
    const connectionWasRemovedSubscriber = EventBus.subscribe(ConnectionWasRemoved.name, (event: EventInterface<ConnectionDataInterface>) => {
      const removedId = event.getData().id;
      update((state) => {
        const current = state.tabs[state.currentTab];
        const tabs = state.tabs.filter((tabItem) => (tabItem.props as any)?.connection?.id !== removedId);
        if (tabs.length === state.tabs.length) {
          return state;
        }
        const kept = tabs.length ? tabs : [{...props.defaultTab, id: uuidv4()}];
        const currentIndex = kept.indexOf(current);
        return {...state, tabs: kept, currentTab: currentIndex >= 0 ? currentIndex : 0, lastOpenTab: -1};
      });
    });

    return () => {
      EventBus.unSub(connectionWasRemovedSubscriber);
      EventBus.unSub(currentTabComponentWasSelectedSubscriber);
      EventBus.unSub(newTabComponentWasSelectedSubscriber);
      EventBus.unSub(currentTabWasChangedSubscriber);
      EventBus.unSub(tabWasClosedSubscriber);
    }

  }, [update, props.defaultTab]);


  /** global shortcuts - tabs, console, theme, help (list in Library/Shortcuts) */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const context = stateRef.current;
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
  }, []);

  /** memo destructor */
  const value = useMemo(() => {
    return {
      ...context,
    }
  }, [context]);


  return (
    <ApplicationRendererContext.Provider value={value}>
      <Box className="application-renderer-root">
        <TabRender/>
        <ApplicationRender/>
      </Box>
    </ApplicationRendererContext.Provider>
  );
}
