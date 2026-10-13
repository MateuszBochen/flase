import {useEffect, useState} from 'react';

/**
 * tables used by open tabs (data, structure, import / export of table) - sidebar marks them,
 * table of the current tab differently
 */
type OpenTableType = {connectionId: string, database: string, table: string, active: boolean};
type TabLikeType = {props?: any};

let openTables: OpenTableType[] = [];
const listeners = new Set<() => void>();

/** database is object of DatabaseInterface or name, table TableInformationInterface or name */
const nameOf = (value: any, key: string): string | null => {
  if (typeof value === 'string') return value;
  return value && typeof value === 'object' && typeof value[key] === 'string' ? value[key] : null;
};

const tableOf = (tab: TabLikeType, active: boolean): OpenTableType | null => {
  const props = tab.props;
  const connectionId = props?.connection?.id;
  const table = nameOf(props?.table, 'tableName');
  const database = nameOf(props?.database, 'name') ?? nameOf(props?.table, 'dataBaseName');
  return connectionId && table && database ? {connectionId, database, table, active} : null;
};

export type OpenTablesOfDatabaseType = {open: Set<string>, active: string | null};

const ofDatabase = (connectionId: string, database: string): OpenTablesOfDatabaseType => {
  const items = openTables.filter((item) => item.connectionId === connectionId && item.database === database);
  return {open: new Set(items.map((item) => item.table)), active: items.find((item) => item.active)?.table ?? null};
};

const sameState = (a: OpenTablesOfDatabaseType, b: OpenTablesOfDatabaseType): boolean =>
  a.active === b.active && a.open.size === b.open.size && Array.from(a.open).every((table) => b.open.has(table));

const OpenTables = {
  /** called by renderer of tabs after every change of tabs */
  publish: (tabs: TabLikeType[], currentTab: number) => {
    openTables = tabs
      .map((tab, index) => tableOf(tab, index === currentTab))
      .filter((item): item is OpenTableType => item !== null);
    listeners.forEach((listener) => listener());
  },
  ofDatabase,
};

/** tables of database open in tabs, component is rendered again only when they change */
export const useOpenTables = (connectionId: string, database: string): OpenTablesOfDatabaseType => {
  const [state, setState] = useState<OpenTablesOfDatabaseType>(() => ofDatabase(connectionId, database));
  useEffect(() => {
    const update = () => setState((previous) => {
      const next = ofDatabase(connectionId, database);
      return sameState(previous, next) ? previous : next;
    });
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, [connectionId, database]);
  return state;
};

export default OpenTables;
