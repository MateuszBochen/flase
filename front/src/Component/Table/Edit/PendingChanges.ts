import {CellValueType, SingleRowType} from '../Interface/RecordsViewPropsInterface';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import EditableResultInterface from '../../../Library/Record/Interface/EditableResultInterface';
import RowChangeInterface from '../../../Library/Record/Interface/RowChangeInterface';

/**
 * Not submitted changes of grid. Row index is index in records of current result,
 * inserted rows are displayed after records (index = records.length + position).
 * Values are keyed by result column key (ColumnInterface.key).
 */
export type PendingChanges = {
  updated: {[rowIndex: number]: SingleRowType};
  deleted: {[rowIndex: number]: true};
  inserted: SingleRowType[];
};

export type RowState = 'normal' | 'updated' | 'inserted' | 'deleted';

export const emptyChanges = (): PendingChanges => ({updated: {}, deleted: {}, inserted: []});

export const countChanges = (changes: PendingChanges): number => {
  const updated = Object.keys(changes.updated).filter((rowIndex) => !changes.deleted[+rowIndex]).length;
  return updated + Object.keys(changes.deleted).length + changes.inserted.length;
};

export const isSameValue = (a: CellValueType | undefined, b: CellValueType | undefined): boolean => {
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b;
  }
  return String(a) === String(b);
};

/** row as displayed - original values with pending changes */
export const getDisplayedRow = (changes: PendingChanges, records: SingleRowType[], rowIndex: number): SingleRowType => {
  if (rowIndex >= records.length) {
    return changes.inserted[rowIndex - records.length] || {};
  }
  return {...records[rowIndex], ...(changes.updated[rowIndex] || {})};
};

export const getRowState = (changes: PendingChanges, records: SingleRowType[], rowIndex: number): RowState => {
  if (rowIndex >= records.length) {
    return 'inserted';
  }
  if (changes.deleted[rowIndex]) {
    return 'deleted';
  }
  return changes.updated[rowIndex] ? 'updated' : 'normal';
};

/** set values of row, values equal to original are removed from pending changes */
export const setRowValues = (
  changes: PendingChanges,
  records: SingleRowType[],
  rowIndex: number,
  values: SingleRowType,
): PendingChanges => {
  if (rowIndex >= records.length) {
    const inserted = [...changes.inserted];
    const insertedIndex = rowIndex - records.length;
    inserted[insertedIndex] = {...inserted[insertedIndex], ...values};
    return {...changes, inserted};
  }

  const rowChanges: SingleRowType = {...(changes.updated[rowIndex] || {}), ...values};
  Object.keys(rowChanges).forEach((columnKey) => {
    if (isSameValue(rowChanges[columnKey], records[rowIndex][columnKey])) {
      delete rowChanges[columnKey];
    }
  });

  const updated = {...changes.updated};
  if (Object.keys(rowChanges).length) {
    updated[rowIndex] = rowChanges;
  } else {
    delete updated[rowIndex];
  }
  return {...changes, updated};
};

export const insertRow = (changes: PendingChanges, values: SingleRowType): PendingChanges => {
  return {...changes, inserted: [...changes.inserted, values]};
};

/**
 * many rows at once - existing rows are marked for delete (or unmarked with undo), inserted rows are removed
 */
export const deleteRows = (changes: PendingChanges, records: SingleRowType[], rowIndexes: number[], undo: boolean): PendingChanges => {
  const deleted = {...changes.deleted};
  rowIndexes.filter((rowIndex) => rowIndex < records.length).forEach((rowIndex) => {
    if (undo) {
      delete deleted[rowIndex];
    } else {
      deleted[rowIndex] = true;
    }
  });
  const removedInserted = new Set(undo ? [] : rowIndexes.filter((rowIndex) => rowIndex >= records.length).map((rowIndex) => rowIndex - records.length));
  return {...changes, deleted, inserted: changes.inserted.filter((row, index) => !removedInserted.has(index))};
};

/** existing row is marked for delete (toggle), inserted row is removed */
export const toggleDeleteRow = (changes: PendingChanges, records: SingleRowType[], rowIndex: number): PendingChanges => {
  if (rowIndex >= records.length) {
    const inserted = changes.inserted.filter((row, index) => index !== rowIndex - records.length);
    return {...changes, inserted};
  }

  const deleted = {...changes.deleted};
  if (deleted[rowIndex]) {
    delete deleted[rowIndex];
  } else {
    deleted[rowIndex] = true;
  }
  return {...changes, deleted};
};

/** values for clone / new row - auto increment and not editable columns are left to database defaults */
export const valuesForNewRow = (columns: ColumnInterface[], source?: SingleRowType): SingleRowType => {
  const values: SingleRowType = {};
  if (!source) {
    return values;
  }
  columns
    .filter((column) => column.editable && !column.autoIncrement)
    .forEach((column) => values[column.key] = source[column.key] ?? null);
  return values;
};

/**
 * converts pending changes into changes for server.
 * Rows are identified by primary key, table without primary key uses all editable columns and LIMIT 1.
 */
export const buildRowChanges = (
  changes: PendingChanges,
  records: SingleRowType[],
  columns: ColumnInterface[],
  editable: EditableResultInterface,
): RowChangeInterface[] => {
  const columnByKey = new Map(columns.map((column) => [column.key, column]));
  const toTableValues = (values: SingleRowType): SingleRowType => {
    const tableValues: SingleRowType = {};
    Object.entries(values).forEach(([key, value]) => {
      const column = columnByKey.get(key);
      if (column?.editable && column.orgName) {
        tableValues[column.orgName] = value;
      }
    });
    return tableValues;
  };

  const limitOne = editable.primaryKey.length === 0;
  const whereOf = (row: SingleRowType): SingleRowType => {
    const identifying = limitOne
      ? columns.filter((column) => column.editable).map((column) => column.key)
      : editable.primaryKey;
    // key column does not have to be editable (e.g. BINARY(16) / bytea key) - it only identifies row
    const where: SingleRowType = {};
    identifying.forEach((key) => {
      // key missing in result is skipped - change is then refused, never matched by NULL
      const name = columnByKey.get(key)?.orgName;
      if (name) {
        where[name] = row[key] ?? null;
      }
    });
    return where;
  };

  const rowChanges: RowChangeInterface[] = [];

  Object.keys(changes.deleted).forEach((rowIndex) => {
    rowChanges.push({kind: 'delete', where: whereOf(records[+rowIndex]), limitOne});
  });

  Object.entries(changes.updated)
    .filter(([rowIndex]) => !changes.deleted[+rowIndex])
    .forEach(([rowIndex, values]) => {
      rowChanges.push({kind: 'update', where: whereOf(records[+rowIndex]), values: toTableValues(values), limitOne});
    });

  changes.inserted.forEach((values) => {
    rowChanges.push({kind: 'insert', values: toTableValues(values)});
  });

  return rowChanges;
};
