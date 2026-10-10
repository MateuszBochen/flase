import ColumnInterface from '../../Table/Interface/ColumnInterface';
import EditableResultInterface from './EditableResultInterface';


interface SingleSelectColumnInterface {
  columns: ColumnInterface[];
  /** null when rows of result cannot be edited */
  editable: EditableResultInterface | null;
  readOnlyReason?: string;
  tabId?: string;
}

export default SingleSelectColumnInterface;
