import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {DirectionOrder} from '../Enum/DirectionOrder';

interface SortIconsPropsInterface {
  onSort: (column: ColumnInterface, direction: DirectionOrder) => void;
  column: ColumnInterface;
}

export default SortIconsPropsInterface;
