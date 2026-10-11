import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {CellValueType} from './RecordsViewPropsInterface';
import {GridHandlersInterface} from './GridEditInterface';
import {TransformType} from '../../../Library/CellTools/ColumnDisplay';

/** only primitive values and stable objects - cell is memoized */
interface CellPropsInterface {
  column: ColumnInterface;
  columnIndex: number;
  rowIndex: number;
  width?: number;
  tabIndex: number;
  cellRender: () => void;
  key?: string|number;
  value: CellValueType;
  /** shown when value is undefined, e.g. DEFAULT in new row */
  placeholder?: string;
  /** value differs from database */
  changed?: boolean;
  isEditing?: boolean;
  selected?: boolean;
  /** grid has editing - selection, context menu */
  hasEdit: boolean;
  /** double click starts editing */
  editable: boolean;
  /** value is foreign key - open referenced row */
  reference: boolean;
  handlers: GridHandlersInterface;
  /** value shown as image, link, date... */
  transform?: TransformType;
  /** value of display column of referenced row */
  label?: string;
}

export default CellPropsInterface;
