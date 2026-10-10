import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {DirectionOrder} from '../Enum/DirectionOrder';


interface SortTableItemInterface {
  column: ColumnInterface;
  direction: DirectionOrder;
}

export default SortTableItemInterface;
