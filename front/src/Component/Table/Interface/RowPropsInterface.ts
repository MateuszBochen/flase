import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {CellValueType, SingleRowType} from './RecordsViewPropsInterface';
import {MutableRefObject} from 'react';
import GridEditInterface from './GridEditInterface';
import {RowState} from '../Edit/PendingChanges';


interface RowPropsInterface {
  columns: ColumnInterface[]; // PropTypes.arrayOf(PropTypes.instanceOf(Column)),
  tabIndex: number; //PropTypes.number,
  cellRender: () => void; //PropTypes.any,
  key?: string|number;
  rowItem: SingleRowType;
  gridRef: MutableRefObject<HTMLDivElement | null>;
  rowIndex: number;
  rowState: RowState;
  /** values changed in this row, keyed by column name */
  changedValues?: SingleRowType;
  edit?: GridEditInterface;
  onOpenReference?: (column: ColumnInterface, value: CellValueType, newTab: boolean) => void;
}

export default RowPropsInterface;
