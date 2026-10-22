import ColumnInterface from '../../../../Library/Table/Interface/ColumnInterface';
import {DirectionOrder} from '../../../Table/Enum/DirectionOrder';


interface SortDirectionDataInterface {
  column: ColumnInterface;
  direction: DirectionOrder;
  tabId: string;
  /** Ctrl / Cmd + click - column is added to current sort (or its direction changed / removed) */
  multiple?: boolean;
}

export default SortDirectionDataInterface;
