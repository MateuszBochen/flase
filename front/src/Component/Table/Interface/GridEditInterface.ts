import {MouseEvent} from 'react';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {CellValueType} from './RecordsViewPropsInterface';
import {PendingChanges} from '../Edit/PendingChanges';

export type EditingCellType = {rowIndex: number, columnKey: string};

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
  /** right click on cell (rowIndex and column) or on empty space of grid (nulls) */
  onContextMenu: (event: MouseEvent, rowIndex: number | null, column: ColumnInterface | null) => void;
}

export default GridEditInterface;
