import ColumnInterface from '../../../../Library/Table/Interface/ColumnInterface';
import {DirectionOrder} from '../../../Table/Enum/DirectionOrder';


interface SortDirectionDataInterface {
  column: ColumnInterface;
  direction: DirectionOrder;
  tabId: string;
}

export default SortDirectionDataInterface;
