
/** description of single column of query result */
interface ResultFieldInterface {
  /** unique key of value in result row - name, or `table.name` when name is not unique (JOIN) */
  key: string;
  /** name in result row (alias) */
  name: string;
  /** column name in table, empty for expressions */
  orgName: string;
  /** table alias in query */
  table: string;
  /** real table name, empty for expressions */
  orgTable: string;
  db: string;
}

export default ResultFieldInterface;
