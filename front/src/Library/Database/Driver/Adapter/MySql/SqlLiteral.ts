import {CellValueType} from '../../../../../Component/Table/Interface/RecordsViewPropsInterface';
import SqlLiteralInterface from '../../SqlLiteralInterface';

/** escaping for SQL generated on client (navigation, filters, copy as INSERT) - MySQL / MariaDB */
class SqlLiteral implements SqlLiteralInterface {
  identifier(name: string): string {
    return `\`${name.replace(/`/g, '``')}\``;
  }

  table(databaseName: string, name: string, currentDatabase?: string): string {
    return databaseName && databaseName !== currentDatabase
      ? `${this.identifier(databaseName)}.${this.identifier(name)}`
      : this.identifier(name);
  }

  value(value: CellValueType | undefined): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    // backslash is escape character in MySQL strings (unless NO_BACKSLASH_ESCAPES)
    return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
  }

  equals(column: string, value: CellValueType | undefined, tableAlias?: string): string {
    const name = tableAlias ? `${this.identifier(tableAlias)}.${this.identifier(column)}` : this.identifier(column);
    return value === null || value === undefined ? `${name} IS NULL` : `${name} = ${this.value(value)}`;
  }

  completionName(name: string): string {
    return /^\w+$/.test(name) ? name : this.identifier(name);
  }
}

export default SqlLiteral;
