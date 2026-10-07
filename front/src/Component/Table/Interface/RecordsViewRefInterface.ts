import {SingleRowType} from './RecordsViewPropsInterface';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import EditableResultInterface from '../../../Library/Record/Interface/EditableResultInterface';

interface RecordsViewRefInterface {
  addRow: (rowItem: SingleRowType) => void;
  setColumns: (columns: ColumnInterface[], editable?: EditableResultInterface | null, readOnlyReason?: string) => void;
  /** keepScroll - stay at the same position, rows of the same query are loaded again */
  reset: (option?: string, keepScroll?: boolean) => void;
  setTotal: (total: number) => void;
  setLimit: (offset: number, perPage: number) => void;
  setFinished: (rows: number) => void;
  setError: (error: string) => void;
  /** drop pending changes */
  clearChanges: () => void;
  /**
   * saved changes are written into displayed records, so grid does not reload.
   * Returns true when query must be loaded again - inserted rows need values from database (auto increment, defaults).
   */
  commitChanges: () => boolean;
}

export default RecordsViewRefInterface;
