import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {SingleRowType} from './RecordsViewPropsInterface';

interface DataGridRefInterface {
  setColumns: (columns: ColumnInterface[]) => void;
  addRow: (record: SingleRowType) => void;
  reset: () => void;
}

export default DataGridRefInterface;
