import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {DirectionOrder} from '../Enum/DirectionOrder';

interface SortIconsPropsInterface {
  /** multiple - Ctrl / Cmd + click: column is added to current sort */
  onSort: (column: ColumnInterface, direction: DirectionOrder, multiple?: boolean) => void;
  column: ColumnInterface;
  order?: {direction: DirectionOrder, position: number | null};
}

export default SortIconsPropsInterface;
