import {SingleRowType} from './RecordsViewPropsInterface';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';

interface RecordsViewRefInterface {
  addRow: (rowItem: SingleRowType) => void;
  setColumns: (columns: ColumnInterface[]) => void;
  reset: (option?: string) => void;
  setTotal: (total: number) => void;
  setLimit: (offset: number, perPage: number) => void;
}

export default RecordsViewRefInterface;
