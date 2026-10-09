/**
 * widths of grid columns set by user, remembered per table (connection / database / table) in browser
 * keyed by column name - widths stay when query selects other columns of the same table
 */
export type ColumnWidthsType = {[columnName: string]: number};

const storageKey = (key: string) => `column-widths:${key}`;

const ColumnWidths = {
  load: (key: string): ColumnWidthsType => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey(key)) || '{}');
      return stored && typeof stored === 'object' ? stored : {};
    } catch (e) {
      // storage not available (private window, blocked) - widths are not remembered
      return {};
    }
  },
  /** widths of shown columns are merged with stored ones (columns not in this result keep their width) */
  save: (key: string, widths: ColumnWidthsType) => {
    try {
      localStorage.setItem(storageKey(key), JSON.stringify({...ColumnWidths.load(key), ...widths}));
    } catch (e) {
      // not remembered
    }
  },
  clear: (key: string) => {
    try {
      localStorage.removeItem(storageKey(key));
    } catch (e) {
      // nothing to clear
    }
  },
};

export default ColumnWidths;
