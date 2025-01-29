import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {SingleRowType} from './RecordsViewPropsInterface';

interface DataGridRefInterface {
  setColumns: (columns: ColumnInterface[]) => void; // PropTypes.arrayOf(PropTypes.instanceOf(Column)),
  addRow: (record: SingleRowType) => void; // PropTypes.array,
}

export default DataGridRefInterface;
