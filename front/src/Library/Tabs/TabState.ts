/**
 * state of tab content remembered in browser (e.g. current query of table, unsaved text of console),
 * keyed by id of tab - tabs keep their id after reload of page
 */
const STORAGE_KEY = 'tab-state';
type StatesType = {[tabId: string]: {[key: string]: any}};

let states: StatesType | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const load = (): StatesType => {
  if (states === null) {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      states = stored && typeof stored === 'object' ? stored : {};
    } catch (e) {
      states = {};
    }
  }
  return states as StatesType;
};

/** typing in console must not write storage on every key */
const save = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(load()));
    } catch (e) {
      // storage not available or full - state is not remembered
    }
  }, 300);
};

const TabState = {
  get: (tabId: string | undefined): {[key: string]: any} => (tabId ? load()[tabId] : undefined) || {},
  update: (tabId: string | undefined, changes: {[key: string]: any}) => {
    if (!tabId) return;
    const all = load();
    all[tabId] = {...(all[tabId] || {}), ...changes};
    save();
  },
  /** states of closed tabs are removed */
  prune: (openTabIds: string[]) => {
    const all = load();
    const open = new Set(openTabIds);
    let changed = false;
    Object.keys(all).forEach((tabId) => {
      if (!open.has(tabId)) {
        delete all[tabId];
        changed = true;
      }
    });
    if (changed) save();
  },
};

export default TabState;
