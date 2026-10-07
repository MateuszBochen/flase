
interface RowChangeStatementInterface {
  sql: string;
  /** update / delete must match exactly one row, otherwise transaction is rolled back */
  expectOneRow: boolean;
}

export default RowChangeStatementInterface;
