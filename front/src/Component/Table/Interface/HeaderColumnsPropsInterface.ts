import {MutableRefObject} from 'react';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {DirectionOrder} from '../Enum/DirectionOrder';


/**
 * @author Mateusz Bochen
 */
interface HeaderColumnsPropsInterface {
  onColumnDidMount: () => void;
  onSort: (column: ColumnInterface, direction: DirectionOrder) => void;
  parentRef: MutableRefObject<HTMLDivElement | null>;
  /** widths set by user are remembered under this key (table), without key only while result is shown */
  widthsKey?: string;
}

export default HeaderColumnsPropsInterface;
