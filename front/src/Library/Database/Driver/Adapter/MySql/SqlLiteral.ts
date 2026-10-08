import {CellValueType} from '../../../../../Component/Table/Interface/RecordsViewPropsInterface';

/** escaping for SQL generated on client (navigation, filters, copy as INSERT) */
class SqlLiteral {
  static identifier(name: string): string {
    return `\`${name.replace(/`/g, '``')}\``;
  }

  /** database.table, database is left out when it is the current one */
  static table(databaseName: string, name: string, currentDatabase?: string): string {
    return databaseName && databaseName !== currentDatabase
      ? `${SqlLiteral.identifier(databaseName)}.${SqlLiteral.identifier(name)}`
      : SqlLiteral.identifier(name);
  }

  static value(value: CellValueType | undefined): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    // backslash is escape character in MySQL strings (unless NO_BACKSLASH_ESCAPES)
    return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  }

  /** `column` = value, NULL is compared with IS NULL */
  static equals(column: string, value: CellValueType | undefined, tableAlias?: string): string {
    const name = tableAlias ? `${SqlLiteral.identifier(tableAlias)}.${SqlLiteral.identifier(column)}` : SqlLiteral.identifier(column);
    return value === null || value === undefined ? `${name} IS NULL` : `${name} = ${SqlLiteral.value(value)}`;
  }
}

export default SqlLiteral;
