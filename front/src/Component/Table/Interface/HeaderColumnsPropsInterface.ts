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
}

export default HeaderColumnsPropsInterface;
