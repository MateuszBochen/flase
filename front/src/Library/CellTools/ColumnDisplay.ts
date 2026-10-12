import EventBus from '../EventBus/EventBus';
import EventInterface from '../EventBus/EventInterface';
import ColumnInterface from '../Table/Interface/ColumnInterface';
import TableInterface from '../Table/Interface/TableInterface';
import TableInformationInterface from '../Table/Interface/TableInformationInterface';

/**
 * How values of column are shown in grid (transformations) and which column of referenced table is shown
 * next to foreign key value. Settings are kept in browser.
 */
export type TransformType = '' | 'image' | 'imageUrl' | 'link' | 'unixTime' | 'bytes' | 'bool' | 'hex' | 'uuid';

const TRANSFORMS_KEY = 'column-transforms';
const DISPLAY_KEY = 'reference-display-columns';

const BINARY_TYPE = /blob|binary|bytea|^bit\b/i;
const NUMBER_TYPE = /int|serial|decimal|numeric|float|double|real|year|bool/i;

export const TRANSFORMS: {transform: TransformType, label: string, applies: (type: string) => boolean}[] = [
  {transform: '', label: 'Value (default)', applies: () => true},
  {transform: 'image', label: 'Image (binary)', applies: (type) => BINARY_TYPE.test(type)},
  {transform: 'imageUrl', label: 'Image from URL', applies: (type) => !BINARY_TYPE.test(type) && !NUMBER_TYPE.test(type)},
  {transform: 'link', label: 'Link (URL, e-mail)', applies: (type) => !BINARY_TYPE.test(type) && !NUMBER_TYPE.test(type)},
  {transform: 'unixTime', label: 'Unix time as date', applies: (type) => NUMBER_TYPE.test(type) || !type},
  {transform: 'bytes', label: 'Size in bytes (KiB, MiB)', applies: (type) => NUMBER_TYPE.test(type) || !type},
  {transform: 'bool', label: 'Yes / no (✓ / ✗)', applies: (type) => NUMBER_TYPE.test(type) || /char|bool/i.test(type) || !type},
  {transform: 'hex', label: 'Hexadecimal', applies: () => true},
  // 16 bytes values are shown as UUID automatically when they look like it
  {transform: 'uuid', label: 'UUID (16 bytes)', applies: (type) => BINARY_TYPE.test(type) || !type},
];

class ColumnDisplayWasChanged implements EventInterface<null> {
  getData(): null {
    return null;
  }
}

const read = (key: string): {[key: string]: string} => {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch (e) {
    return {};
  }
};

const write = (key: string, values: {[key: string]: string}) => {
  try {
    localStorage.setItem(key, JSON.stringify(values));
  } catch (e) {
    // not remembered
  }
  EventBus.emit(new ColumnDisplayWasChanged());
};

/** column of table - the same in table tab and in console results */
const columnId = (connectionId: string, column: ColumnInterface): string | null => column.table?.name
  ? `${connectionId}:${column.table.databaseName}.${column.table.name}.${column.orgName || column.name}`
  : null;

const tableId = (connectionId: string, table: TableInterface) => `${connectionId}:${table.databaseName}.${table.name}`;

/** typical names of column describing row */
const LABEL_NAME = /^(name|title|label|display_?name|full_?name|username|login|email|code|slug|subject|caption)$/i;

const ColumnDisplay = {
  eventName: ColumnDisplayWasChanged.name,

  transformOf: (connectionId: string, column: ColumnInterface): TransformType => {
    const id = columnId(connectionId, column);
    return id ? (read(TRANSFORMS_KEY)[id] as TransformType) || '' : '';
  },

  setTransform: (connectionId: string, column: ColumnInterface, transform: TransformType) => {
    const id = columnId(connectionId, column);
    if (!id) return;
    const values = read(TRANSFORMS_KEY);
    if (transform) values[id] = transform;
    else delete values[id];
    write(TRANSFORMS_KEY, values);
  },

  /** column chosen by user, '' - only key, undefined - not chosen */
  displayColumnOf: (connectionId: string, table: TableInterface): string | undefined => read(DISPLAY_KEY)[tableId(connectionId, table)],

  setDisplayColumn: (connectionId: string, table: TableInterface, column: string) => {
    const values = read(DISPLAY_KEY);
    values[tableId(connectionId, table)] = column;
    write(DISPLAY_KEY, values);
  },

  /** column describing row of table - name, title... or first text column which is not key */
  guessDisplayColumn: (table: TableInformationInterface | undefined): string => {
    if (!table) return '';
    const columns = table.columns.filter((column) => !column.primaryKey && !column.reference);
    return (columns.find((column) => LABEL_NAME.test(column.name))
      || columns.find((column) => /char|text/i.test(column.type || '') && !/uuid/i.test(column.name)))?.name || '';
  },
};

export default ColumnDisplay;
