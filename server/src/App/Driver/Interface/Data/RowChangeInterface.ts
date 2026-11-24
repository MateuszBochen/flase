
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
  /**
   * where of limitOne does not compare all columns (preview of long text / binary value, column which cannot be
   * compared) - more matching rows are not copies of one row, the change is refused instead of changing any of them
   */
  partialWhere?: boolean;
}

export default RowChangeInterface;
