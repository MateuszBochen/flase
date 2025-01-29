import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {MutableRefObject} from 'react';

interface CellPropsInterface {
  column: ColumnInterface; // PropTypes.arrayOf(PropTypes.instanceOf(Column)),
  tabIndex: number; //PropTypes.number,
  cellRender: () => void; //PropTypes.any,
  key?: string|number;
  value: string|number;
  gridRef: MutableRefObject<HTMLDivElement | null>
}

export default CellPropsInterface;
