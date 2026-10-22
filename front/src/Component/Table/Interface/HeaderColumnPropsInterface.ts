import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {DirectionOrder} from '../Enum/DirectionOrder';
import {MouseEvent, MutableRefObject} from 'react';


interface HeaderColumnPropsInterface {
  column: ColumnInterface;
  /** multiple - Ctrl / Cmd + click: column is added to current sort */
  onSort: (column: ColumnInterface, direction: DirectionOrder, multiple?: boolean) => void;
  key?: number|string;
  /** column is in ORDER BY - direction, position when more columns are sorted */
  order?: {direction: DirectionOrder, position: number | null};
  gridRef: MutableRefObject<HTMLDivElement | null>;
  /** width set by user, undefined = automatic */
  width?: number;
  /** drag of right edge started */
  onResizeStart: (event: MouseEvent) => void;
  /** double click on right edge - width of content */
  onResizeFit: () => void;
}

export default HeaderColumnPropsInterface;
