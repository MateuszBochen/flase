import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {MouseEvent, MutableRefObject} from 'react';
import {CellValueType} from './RecordsViewPropsInterface';

interface CellPropsInterface {
  column: ColumnInterface; // PropTypes.arrayOf(PropTypes.instanceOf(Column)),
  tabIndex: number; //PropTypes.number,
  cellRender: () => void; //PropTypes.any,
  key?: string|number;
  value: CellValueType;
  gridRef: MutableRefObject<HTMLDivElement | null>;
  /** shown when value is undefined, e.g. DEFAULT in new row */
  placeholder?: string;
  /** value differs from database */
  changed?: boolean;
  isEditing?: boolean;
  onDoubleClick?: () => void;
  onContextMenu?: (event: MouseEvent) => void;
  selected?: boolean;
  onMouseDown?: (event: MouseEvent) => void;
  onMouseEnter?: () => void;
  /** value is foreign key - open referenced row */
  onOpenReference?: (newTab: boolean) => void;
  onCommit?: (value: CellValueType) => void;
  onCancel?: () => void;
}

export default CellPropsInterface;
