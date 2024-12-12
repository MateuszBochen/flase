import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {DirectionOrder} from '../Enum/DirectionOrder';


interface HeaderColumnPropsInterface {
  column: ColumnInterface;
  onSort: (column: ColumnInterface, direction: DirectionOrder) => void;
  key?: number|string;
}

export default HeaderColumnPropsInterface;
