import {FC} from 'react';
import {v4 as uuidv4} from 'uuid';
import ApplicationRendererContextInterface from './Interface/ApplicationRendererContextInterface';
import TabInterface from './Interface/TabInterface';
import ConnectionSettings from '../../Library/Connection/ConnectionSettings';
import ConnectionDataInterface from '../../Library/Connection/Interface/ConnectionDataInterface';
import TabState from '../../Library/Tabs/TabState';
import WhatsNew from '../Application/WhatsNew/WhatsNew';
import NewDatabaseConnection from '../Application/NewDatabaseConnection/NewDatabaseConnection';
import TestApp from '../Application/TestApp/TestApp';
import TableRecords from '../Application/TableRecords/TableRecords';
import SqlConsole from '../Application/SqlConsole/SqlConsole';
import TransferTab from '../Application/Transfer/TransferTab';
import DatabaseSearch from '../Application/DatabaseSearch/DatabaseSearch';
import ErDiagram from '../Application/ErDiagram/ErDiagram';
import UserManager from '../Application/Users/UserManager';
import ProcessList from '../Application/ProcessList/ProcessList';
import DatabaseOverview from '../Application/DatabaseOverview/DatabaseOverview';
import CreateTable from '../Application/CreateTable/CreateTable';
import ServerStatus from '../Application/ServerStatus/ServerStatus';
import QueryBuilder from '../Application/QueryBuilder/QueryBuilder';

/**
 * Open tabs are remembered in browser and opened again after reload of page.
 * Props are stored as JSON, connection by its id - tab of deleted or not connected connection is not restored.
 */
const STORAGE_KEY = 'open-tabs';

/** kinds of tabs which can be restored */
const TAB_TYPES: {type: string, component: FC<any>}[] = [
  {type: 'welcome', component: WhatsNew},
  {type: 'new-connection', component: NewDatabaseConnection},
  {type: 'test-app', component: TestApp},
  {type: 'table', component: TableRecords},
  {type: 'console', component: SqlConsole},
  {type: 'transfer', component: TransferTab},
  {type: 'search', component: DatabaseSearch},
  {type: 'er-diagram', component: ErDiagram},
  {type: 'users', component: UserManager},
  {type: 'processes', component: ProcessList},
  {type: 'database-overview', component: DatabaseOverview},
  {type: 'create-table', component: CreateTable},
  {type: 'server-status', component: ServerStatus},
  {type: 'query-builder', component: QueryBuilder},
];

type StoredTabType = {id: string, type: string, tabName: string, props: {[key: string]: any} | null, connectionId?: string};
type StoredType = {tabs: StoredTabType[], currentTab: number};

const serializeProps = (props: any): {props: {[key: string]: any} | null, connectionId?: string} => {
  if (!props || typeof props !== 'object') {
    return {props: null};
  }
  const {connection, tabId, table, ...rest} = props;
  const stored: {[key: string]: any} = JSON.parse(JSON.stringify(rest));
  // information about table is loaded again, only its name is kept
  if (table && typeof table === 'object') {
    stored.table = {tableName: table.tableName, dataBaseName: table.dataBaseName, preload: false, columns: [], primaryColumns: [], uniqueColumns: []};
  } else if (table !== undefined) {
    stored.table = table;
  }
  return {props: stored, connectionId: connection?.id};
};

/** connection of tab: saved one, or (connection defined on server, loaded later) the one stored with login */
const connectionOf = (id: string): ConnectionDataInterface | null => {
  const settings = ConnectionSettings.getInstance();
  const established = settings.getEstablishedConnection()[id];
  if (!established) {
    // not connected (logged out, expired before reload) - its tabs would only show errors
    return null;
  }
  return settings.getConnection(id) || established.connection;
};

const TabPersistence = {
  save: (context: ApplicationRendererContextInterface) => {
    const tabs: StoredTabType[] = [];
    context.tabs.forEach((tab) => {
      const known = TAB_TYPES.find((item) => item.component === tab.component);
      if (!known) return;
      try {
        tabs.push({id: tab.id, type: known.type, tabName: tab.tabName, ...serializeProps(tab.props)});
      } catch (e) {
        // props which cannot be stored - tab is not restored
      }
    });
    const current = context.tabs[context.currentTab];
    const stored: StoredType = {tabs, currentTab: Math.max(0, tabs.findIndex((tab) => tab.id === current?.id))};
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch (e) {
      // not remembered
    }
    TabState.prune(tabs.map((tab) => tab.id));
  },

  /** tabs of last visit, null when there are none */
  restore: (): ApplicationRendererContextInterface | null => {
    let stored: StoredType;
    try {
      stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (e) {
      return null;
    }
    if (!stored || !Array.isArray(stored.tabs)) {
      return null;
    }
    const currentId = stored.tabs[stored.currentTab]?.id;
    const tabs: (TabInterface<any> & {id: string})[] = [];
    stored.tabs.forEach((item) => {
      const known = TAB_TYPES.find((tabType) => tabType.type === item.type);
      if (!known) return;
      let props: any = item.props;
      if (item.connectionId) {
        const connection = connectionOf(item.connectionId);
        if (!connection) return;
        props = {...props, connection};
      }
      tabs.push({id: item.id || uuidv4(), component: known.component, props, tabName: item.tabName, isActive: false});
    });
    if (!tabs.length) {
      return null;
    }
    const currentTab = Math.max(0, tabs.findIndex((tab) => tab.id === currentId));
    return {tabs, currentTab, lastOpenTab: -1};
  },
};

export default TabPersistence;
