import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {SingleRowType} from './RecordsViewPropsInterface';


interface RowPropsInterface {
  columns: ColumnInterface[]; // PropTypes.arrayOf(PropTypes.instanceOf(Column)),
  tabIndex: number; //PropTypes.number,
  cellRender: () => void; //PropTypes.any,
  key?: string|number;
  rowItem: SingleRowType;
}

export default RowPropsInterface;
