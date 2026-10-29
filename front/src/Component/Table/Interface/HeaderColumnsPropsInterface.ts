import {MutableRefObject} from 'react';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {DirectionOrder} from '../Enum/DirectionOrder';
import {OrderItemType} from '../../../Library/Database/Interface/QueryInterface';


/**
 * @author Mateusz Bochen
 */
interface HeaderColumnsPropsInterface {
  onColumnDidMount: () => void;
  /** multiple - Ctrl / Cmd + click: column is added to current sort */
  onSort: (column: ColumnInterface, direction: DirectionOrder, multiple?: boolean) => void;
  parentRef: MutableRefObject<HTMLDivElement | null>;
  /** ORDER BY of current query - shown in headers */
  sortOrder?: OrderItemType[];
  /** widths set by user are remembered under this key (table), without key only while result is shown */
  widthsKey?: string;
  /** query failed - no skeleton of loading columns */
  failed?: boolean;
}

export default HeaderColumnsPropsInterface;
