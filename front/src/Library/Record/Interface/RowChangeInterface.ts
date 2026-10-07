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
}

export default RowChangeInterface;
