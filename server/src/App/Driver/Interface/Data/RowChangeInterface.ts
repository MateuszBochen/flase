
export type RowValueType = string | number | null;
export type RowValuesType = {[columnName: string]: RowValueType};

/** single change of row, column names are table column names (orgName) */
interface RowChangeInterface {
  kind: 'update' | 'insert' | 'delete';
  /** identifies the row for update and delete */
  where?: RowValuesType;
  /** new values for update and insert */
  values?: RowValuesType;
  /** table has no primary key - where uses all columns and affects only one row */
  limitOne?: boolean;
}

export default RowChangeInterface;
