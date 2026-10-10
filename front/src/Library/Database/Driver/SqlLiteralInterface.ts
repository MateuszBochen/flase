import {CellValueType} from '../../../Component/Table/Interface/RecordsViewPropsInterface';

/** escaping for SQL generated on client (navigation, filters, copy as INSERT) */
interface SqlLiteralInterface {
  identifier(name: string): string;

  /** database.table, database is left out when it is the current one */
  table(databaseName: string, name: string, currentDatabase?: string): string;

  value(value: CellValueType | undefined): string;

  /** column = value, NULL is compared with IS NULL */
  equals(column: string, value: CellValueType | undefined, tableAlias?: string): string;

  /** name as typed in editor - quoted only when needed */
  completionName(name: string): string;
}

export default SqlLiteralInterface;
