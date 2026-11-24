import {SingleRowType} from '../../../Component/Table/Interface/RecordsViewPropsInterface';

/** single change of row sent to server, column names are table column names (orgName) */
interface RowChangeInterface {
  kind: 'update' | 'insert' | 'delete';
  /** identifies the row for update and delete */
  where?: SingleRowType;
  /** new values for update and insert */
  values?: SingleRowType;
  /** table has no primary key - where uses all columns and affects only one row */
  limitOne?: boolean;
  /**
   * where of limitOne does not compare all columns (preview of long text / binary value, column which cannot be
   * compared) - more matching rows are not copies of one row, the change is refused instead of changing any of them
   */
  partialWhere?: boolean;
}

export default RowChangeInterface;
