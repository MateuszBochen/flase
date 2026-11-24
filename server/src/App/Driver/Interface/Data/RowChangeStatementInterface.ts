
interface RowChangeStatementInterface {
  sql: string;
  /** update / delete must match exactly one row, otherwise transaction is rolled back */
  expectOneRow: boolean;
  /** COUNT(*) AS n of rows matched by where - more than one means the row cannot be identified, nothing is saved */
  matchingRowsSql?: string;
}

/** where of table without primary key matched more rows which differ in columns the where could not compare */
export const notIdentifiedRowError = (matching: number, sql: string): Error => new Error(
  `Row cannot be identified - ${matching} rows of table without primary key have the same values in compared columns `
  + `(long texts and binary values are compared only by their beginning, some columns cannot be compared). `
  + `Nothing was saved, add primary key to the table or change the row by SQL. ${sql}`,
);

export default RowChangeStatementInterface;
