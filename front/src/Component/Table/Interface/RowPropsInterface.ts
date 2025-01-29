import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {SingleRowType} from './RecordsViewPropsInterface';
import {MutableRefObject} from 'react';


interface RowPropsInterface {
  columns: ColumnInterface[]; // PropTypes.arrayOf(PropTypes.instanceOf(Column)),
  tabIndex: number; //PropTypes.number,
  cellRender: () => void; //PropTypes.any,
  key?: string|number;
  rowItem: SingleRowType;
  gridRef: MutableRefObject<HTMLDivElement | null>
}

export default RowPropsInterface;
