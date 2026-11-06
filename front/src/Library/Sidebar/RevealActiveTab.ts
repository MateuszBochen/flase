import {useEffect, useState} from 'react';

/**
 * "Always select opened table" (as in IDE) - switching of tab opens in sidebar the connection, database
 * and table of the tab and scrolls to the table. Turned on / off by button above sidebar, remembered in browser.
 */
export type RevealTargetType = {
  connectionId: string,
  /** connection of database of PostgreSQL server - parent connection and the database (catalog) */
  parentId: string | null,
  catalog: string | null,
  database: string | null,
  table: string | null,
  /** every reveal - also of the same target after turning on */
  seq: number,
};
type TabLikeType = {props?: any};

const STORAGE_KEY = 'reveal-active-tab';
let enabled = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch (e) {
    return false;
  }
})();
let current: Omit<RevealTargetType, 'seq'> | null = null;
let target: RevealTargetType | null = null;
let seq = 0;
const listeners = new Set<() => void>();

const nameOf = (value: any, key: string): string | null => {
  if (typeof value === 'string') return value;
  return value && typeof value === 'object' && typeof value[key] === 'string' ? value[key] : null;
};

const targetOf = (tab: TabLikeType | undefined): Omit<RevealTargetType, 'seq'> | null => {
  const props = tab?.props;
  const connection = props?.connection;
  if (!connection?.id) return null;
  return {
    connectionId: connection.id,
    parentId: connection.parentId ?? null,
    catalog: connection.catalog ?? null,
    database: nameOf(props.database, 'name') ?? nameOf(props.table, 'dataBaseName'),
    table: nameOf(props.table, 'tableName'),
  };
};

const sameTarget = (a: Omit<RevealTargetType, 'seq'> | null, b: Omit<RevealTargetType, 'seq'> | null): boolean =>
  a?.connectionId === b?.connectionId && a?.database === b?.database && a?.table === b?.table;

const reveal = () => {
  target = enabled && current ? {...current, seq: ++seq} : null;
  listeners.forEach((listener) => listener());
};

const RevealActiveTab = {
  /** called by renderer of tabs after every change of tabs - only change of table / database of current tab reveals it */
  publish: (tabs: TabLikeType[], currentTab: number) => {
    const next = targetOf(tabs[currentTab]);
    if (sameTarget(current, next)) return;
    current = next;
    if (enabled) reveal();
  },
  isEnabled: (): boolean => enabled,
  toggle: () => {
    enabled = !enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch (e) {
      // not remembered
    }
    // turned on - current tab is shown at once
    reveal();
  },
};

/** the last revealed tab, null when turned off */
export const useRevealTarget = (): RevealTargetType | null => {
  const [state, setState] = useState<RevealTargetType | null>(target);
  useEffect(() => {
    const update = () => setState(target);
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return state;
};

export const useRevealEnabled = (): boolean => {
  const [state, setState] = useState<boolean>(enabled);
  useEffect(() => {
    const update = () => setState(enabled);
    update();
    listeners.add(update);
    return () => {
      listeners.delete(update);
    };
  }, []);
  return state;
};

export default RevealActiveTab;
