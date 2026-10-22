import {useEffect, useState} from 'react';

/**
 * Databases (schemas, databases of PostgreSQL server) with the same prefix are shown in a group of sidebar,
 * e.g. shop_dev, shop_prod, shop_test in "shop_". Prefix ends with separator _ - . (or :), group needs
 * MIN_GROUP_SIZE items; groups with many items are split by the next part of name (client_a_1… in client_a_).
 * Grouping can be turned off for a connection (context menu of database).
 */
export const MIN_GROUP_SIZE = 3;
const SEPARATOR = /[_\-.:]/;
const STORAGE_KEY = 'database-grouping-off';
const listeners = new Set<() => void>();

export type GroupedType<T> = {kind: 'item', item: T} | {kind: 'group', prefix: string, items: GroupedType<T>[], count: number};

/** prefix of name ending with the first separator after start, null when there is no separator (or name is only the prefix) */
const prefixOf = (name: string, start: number): string | null => {
  const index = name.slice(start).search(SEPARATOR);
  if (index <= 0) return null;
  const end = start + index + 1;
  return end < name.length ? name.slice(0, end) : null;
};

const countOf = <T>(entries: GroupedType<T>[]): number => entries.reduce((sum, entry) => sum + (entry.kind === 'item' ? 1 : entry.count), 0);

/** items in their order, groups at place of their first item; names of one group start with the prefix */
const group = <T>(items: T[], nameOf: (item: T) => string, start: number, minSize: number): GroupedType<T>[] => {
  const byPrefix = new Map<string, T[]>();
  items.forEach((item) => {
    const prefix = prefixOf(nameOf(item), start);
    if (prefix !== null) {
      byPrefix.set(prefix, [...(byPrefix.get(prefix) || []), item]);
    }
  });
  const result: GroupedType<T>[] = [];
  const done = new Set<string>();
  items.forEach((item) => {
    const prefix = prefixOf(nameOf(item), start);
    const members = prefix !== null ? byPrefix.get(prefix)! : [];
    if (prefix === null || members.length < minSize) {
      result.push({kind: 'item', item});
      return;
    }
    if (done.has(prefix)) return;
    done.add(prefix);
    let inner = group(members, nameOf, prefix.length, minSize);
    let label = prefix;
    // all items share also the next part - one group with longer prefix instead of group in group
    while (inner.length === 1 && inner[0].kind === 'group') {
      label = inner[0].prefix;
      inner = inner[0].items;
    }
    result.push({kind: 'group', prefix: label, items: inner, count: countOf(inner)});
  });
  return result;
};

export const groupByPrefix = <T>(items: T[], nameOf: (item: T) => string, minSize: number = MIN_GROUP_SIZE): GroupedType<T>[] => group(items, nameOf, 0, minSize);

const loadOff = (): Set<string> => {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return new Set(Array.isArray(stored) ? stored : []);
  } catch (e) {
    return new Set();
  }
};

const DatabaseGrouping = {
  isEnabled: (connectionId: string): boolean => !loadOff().has(connectionId),

  setEnabled: (connectionId: string, enabled: boolean) => {
    const off = loadOff();
    if (enabled) off.delete(connectionId); else off.add(connectionId);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(off)));
    } catch (e) {
      // not remembered
    }
    listeners.forEach((listener) => listener());
  },
};

/** grouping of connection, follows changes */
export const useDatabaseGrouping = (connectionId: string): boolean => {
  const [enabled, setEnabled] = useState<boolean>(() => DatabaseGrouping.isEnabled(connectionId));
  useEffect(() => {
    const listener = () => setEnabled(DatabaseGrouping.isEnabled(connectionId));
    listener();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [connectionId]);
  return enabled;
};

export default DatabaseGrouping;
