import {MouseEvent} from 'react';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {CellValueType} from './RecordsViewPropsInterface';
import {PendingChanges} from '../Edit/PendingChanges';

export type EditingCellType = {rowIndex: number, columnKey: string};

export type CellPositionType = {rowIndex: number, columnIndex: number};

/** rectangle of cells between anchor (first clicked) and focus (last) */
export type SelectionRangeType = {anchor: CellPositionType, focus: CellPositionType};

/** Ctrl+click adds ranges - selection does not have to be one rectangle */
export type SelectionType = SelectionRangeType[];

export type SelectModeType = 'replace' | 'extend' | 'add';

export const isInRange = (range: SelectionRangeType, rowIndex: number, columnIndex: number): boolean => {
  const {anchor, focus} = range;
  return rowIndex >= Math.min(anchor.rowIndex, focus.rowIndex) && rowIndex <= Math.max(anchor.rowIndex, focus.rowIndex)
    && columnIndex >= Math.min(anchor.columnIndex, focus.columnIndex) && columnIndex <= Math.max(anchor.columnIndex, focus.columnIndex);
};

export const isInSelection = (selection: SelectionType | null, rowIndex: number, columnIndex: number): boolean => {
  return !!selection && selection.some((range) => isInRange(range, rowIndex, columnIndex));
};

/** rows and columns which have at least one selected cell, sorted */
export const selectedRowsAndColumns = (selection: SelectionType, rowsCount: number): {rows: number[], columns: number[]} => {
  const rows = new Set<number>();
  const columns = new Set<number>();
  selection.forEach(({anchor, focus}) => {
    for (let row = Math.min(anchor.rowIndex, focus.rowIndex); row <= Math.min(Math.max(anchor.rowIndex, focus.rowIndex), rowsCount - 1); row++) {
      rows.add(row);
    }
    for (let column = Math.min(anchor.columnIndex, focus.columnIndex); column <= Math.max(anchor.columnIndex, focus.columnIndex); column++) {
      columns.add(column);
    }
  });
  const sort = (values: Set<number>) => Array.from(values).sort((a, b) => a - b);
  return {rows: sort(rows), columns: sort(columns)};
};

/** editing state of grid, passed from RecordsView to rows and cells */
interface GridEditInterface {
  changes: PendingChanges;
  selectedRow: number | null;
  editingCell: EditingCellType | null;
  /** result is editable */
  canEdit: boolean;
  onSelectRow: (rowIndex: number) => void;
  onStartEdit: (rowIndex: number, column: ColumnInterface) => void;
  onCommitEdit: (rowIndex: number, column: ColumnInterface, value: CellValueType) => void;
  onCancelEdit: () => void;
  selection: SelectionType | null;
  /** left button - shift extends last range, ctrl adds cell / range */
  onCellMouseDown: (rowIndex: number, columnIndex: number, mode: SelectModeType) => void;
  /** mouse moved over cell - extends selection while dragging */
  onCellMouseEnter: (rowIndex: number, columnIndex: number) => void;
  /** right click on cell (rowIndex and column) or on empty space of grid (nulls) */
  onContextMenu: (event: MouseEvent, rowIndex: number | null, column: ColumnInterface | null) => void;
}

export default GridEditInterface;

/** stable callbacks of grid - the same object for whole life of grid, so memoized rows and cells are not re-rendered */
export interface GridHandlersInterface {
  onSelectRow: (rowIndex: number) => void;
  onStartEdit: (rowIndex: number, column: ColumnInterface) => void;
  onCommitEdit: (rowIndex: number, column: ColumnInterface, value: CellValueType) => void;
  onCancelEdit: () => void;
  onCellMouseDown: (rowIndex: number, columnIndex: number, mode: SelectModeType) => void;
  onCellMouseEnter: (rowIndex: number, columnIndex: number) => void;
  onContextMenu: (event: MouseEvent, rowIndex: number | null, column: ColumnInterface | null) => void;
  onOpenReference: (column: ColumnInterface, value: CellValueType, newTab: boolean) => void;
}

/** selected columns of one row as text "from-to,from-to" - primitive value, cheap to compare in memoized row */
export const selectedColumnsOfRow = (selection: SelectionType | null, rowIndex: number): string | null => {
  if (!selection) return null;
  const ranges: string[] = [];
  selection.forEach(({anchor, focus}) => {
    if (rowIndex >= Math.min(anchor.rowIndex, focus.rowIndex) && rowIndex <= Math.max(anchor.rowIndex, focus.rowIndex)) {
      ranges.push(`${Math.min(anchor.columnIndex, focus.columnIndex)}-${Math.max(anchor.columnIndex, focus.columnIndex)}`);
    }
  });
  return ranges.length ? ranges.join(',') : null;
};

export const parseSelectedColumns = (selectedColumns: string | null): Array<[number, number]> => selectedColumns
  ? selectedColumns.split(',').map((range) => range.split('-').map(Number) as [number, number])
  : [];
