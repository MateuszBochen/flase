import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {DirectionOrder} from '../Enum/DirectionOrder';
import {MouseEvent, MutableRefObject} from 'react';


interface HeaderColumnPropsInterface {
  column: ColumnInterface;
  onSort: (column: ColumnInterface, direction: DirectionOrder) => void;
  key?: number|string;
  gridRef: MutableRefObject<HTMLDivElement | null>;
  /** width set by user, undefined = automatic */
  width?: number;
  /** drag of right edge started */
  onResizeStart: (event: MouseEvent) => void;
  /** double click on right edge - width of content */
  onResizeFit: () => void;
}

export default HeaderColumnPropsInterface;
