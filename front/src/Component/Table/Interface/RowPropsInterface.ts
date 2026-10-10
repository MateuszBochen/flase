import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {SingleRowType} from './RecordsViewPropsInterface';
import {GridHandlersInterface} from './GridEditInterface';
import {RowState} from '../Edit/PendingChanges';

/** only primitive values and stable objects - row is memoized */
interface RowPropsInterface {
  columns: ColumnInterface[];
  /** width of columns measured from header */
  widths: number[];
  /** first and last rendered column (horizontal virtualization), null = all */
  visibleColumns: [number, number] | null;
  tabIndex: number;
  cellRender: () => void;
  key?: string|number;
  /** record as loaded (or new row) - changed values are merged in row */
  record: SingleRowType;
  rowIndex: number;
  rowState: RowState;
  /** values changed in this row, keyed by column name */
  changedValues?: SingleRowType;
  /** grid has editing (selection, context menu) */
  hasEdit: boolean;
  canEdit: boolean;
  selected: boolean;
  /** see selectedColumnsOfRow */
  selectedColumns: string | null;
  editingColumnKey: string | null;
  hasReference: boolean;
  handlers: GridHandlersInterface;
}

export default RowPropsInterface;
