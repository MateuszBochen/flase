import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {DirectionOrder} from '../Enum/DirectionOrder';
import {MutableRefObject} from 'react';


interface HeaderColumnPropsInterface {
  column: ColumnInterface;
  onSort: (column: ColumnInterface, direction: DirectionOrder) => void;
  key?: number|string;
  gridRef: MutableRefObject<HTMLDivElement | null>
}

export default HeaderColumnPropsInterface;
