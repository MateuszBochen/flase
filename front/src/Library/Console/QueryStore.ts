import SettingsAPI from '../Settings/SettingsAPI';

export type HistoryEntryType = {
  sql: string;
  database: string | null;
  executedAt: number;
  durationMs: number;
  /** error message of failed statement */
  error?: string;
};

export type SavedQueryType = {
  id: string;
  name: string;
  sql: string;
  database: string | null;
  savedAt: number;
};

const HISTORY_KEY = 'query_history';
const SAVED_KEY = 'saved_queries';
const HISTORY_LIMIT = 500;

type Listener = () => void;

/**
 * Executed statements and saved queries of every connection, kept in localStorage.
 * Key of maps is connection id.
 */
class QueryStore {
  private static instance: QueryStore;
  private readonly listeners = new Set<Listener>();

  public static getInstance(): QueryStore {
    if (!QueryStore.instance) {
      QueryStore.instance = new QueryStore();
    }
    return QueryStore.instance;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getHistory(connectionId: string): HistoryEntryType[] {
    return this.read<HistoryEntryType>(HISTORY_KEY)[connectionId] || [];
  }

  /** newest first, the same statement is moved to the top instead of repeated */
  addHistory(connectionId: string, entry: HistoryEntryType): void {
    const all = this.read<HistoryEntryType>(HISTORY_KEY);
    const list = (all[connectionId] || []).filter((item) => !(item.sql === entry.sql && item.database === entry.database));
    all[connectionId] = [entry, ...list].slice(0, HISTORY_LIMIT);
    this.write(HISTORY_KEY, all);
  }

  clearHistory(connectionId: string): void {
    const all = this.read<HistoryEntryType>(HISTORY_KEY);
    delete all[connectionId];
    this.write(HISTORY_KEY, all);
  }

  getSaved(connectionId: string): SavedQueryType[] {
    return this.read<SavedQueryType>(SAVED_KEY)[connectionId] || [];
  }

  /** query with the same name is replaced */
  saveQuery(connectionId: string, query: Omit<SavedQueryType, 'id' | 'savedAt'>): void {
    const all = this.read<SavedQueryType>(SAVED_KEY);
    const list = (all[connectionId] || []).filter((item) => item.name !== query.name);
    all[connectionId] = [{...query, id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, savedAt: Date.now()}, ...list];
    this.write(SAVED_KEY, all);
  }

  removeSaved(connectionId: string, id: string): void {
    const all = this.read<SavedQueryType>(SAVED_KEY);
    all[connectionId] = (all[connectionId] || []).filter((item) => item.id !== id);
    this.write(SAVED_KEY, all);
  }

  private read<T>(key: string): {[connectionId: string]: T[]} {
    try {
      return SettingsAPI.getSettings<{[connectionId: string]: T[]}>(key) || {};
    } catch (e) {
      return {};
    }
  }

  private write<T>(key: string, value: {[connectionId: string]: T[]}): void {
    SettingsAPI.setSettings(key, value);
    this.listeners.forEach((listener) => listener());
  }
}

export default QueryStore;
