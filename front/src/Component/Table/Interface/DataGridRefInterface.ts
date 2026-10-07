import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {SingleRowType} from './RecordsViewPropsInterface';

interface DataGridRefInterface {
  setColumns: (columns: ColumnInterface[]) => void;
  addRow: (record: SingleRowType) => void;
  /** keepScroll - rows are loaded again at the same position, e.g. refresh after save */
  reset: (keepScroll?: boolean) => void;
  /** saved changes are written into records without loading them again */
  applyChanges: (updated: {[rowIndex: number]: SingleRowType}, deleted: number[]) => void;
  /** records as received from database, without pending changes */
  getRecords: () => SingleRowType[];
}

export default DataGridRefInterface;
