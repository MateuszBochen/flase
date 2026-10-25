import {CellValueType} from '../../../Component/Table/Interface/RecordsViewPropsInterface';
import {BinaryValueInterface, LongTextInterface} from '../../Record/BinaryValue';

/** value of cell - binary values and long texts come from server as preview object */
export type SqlValueType = CellValueType | BinaryValueInterface | LongTextInterface | undefined;

/** escaping for SQL generated on client (navigation, filters, copy as INSERT) */
interface SqlLiteralInterface {
  identifier(name: string): string;

  /** database.table, database is left out when it is the current one */
  table(databaseName: string, name: string, currentDatabase?: string): string;

  /** throws for binary value which is longer than its preview */
  value(value: SqlValueType): string;

  /** column = value, NULL is compared with IS NULL */
  equals(column: string, value: SqlValueType, tableAlias?: string): string;

  /** name as typed in editor - quoted only when needed */
  completionName(name: string): string;
}

export default SqlLiteralInterface;
