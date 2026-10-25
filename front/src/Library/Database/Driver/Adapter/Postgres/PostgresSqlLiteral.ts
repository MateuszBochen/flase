import SqlLiteralInterface, {SqlValueType} from '../../SqlLiteralInterface';
import {binaryHexForSql, isBinaryValue, isLongText, longTextForSql} from '../../../../Record/BinaryValue';

/** escaping for SQL generated on client - PostgreSQL ("names", standard strings) */
class PostgresSqlLiteral implements SqlLiteralInterface {
  identifier(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  table(databaseName: string, name: string, currentDatabase?: string): string {
    return databaseName && databaseName !== currentDatabase
      ? `${this.identifier(databaseName)}.${this.identifier(name)}`
      : this.identifier(name);
  }

  value(value: SqlValueType): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (isLongText(value)) {
      return longTextForSql(value);
    }
    if (isBinaryValue(value)) {
      // without backslash - correct also when standard_conforming_strings is off
      return `decode('${binaryHexForSql(value)}', 'hex')`;
    }
    const text = String(value);
    const quoted = `'${text.replace(/'/g, "''")}'`;
    // E'' string is correct also when standard_conforming_strings is off
    return text.includes('\\') ? `E${quoted.replace(/\\/g, '\\\\')}` : quoted;
  }

  equals(column: string, value: SqlValueType, tableAlias?: string): string {
    const name = tableAlias ? `${this.identifier(tableAlias)}.${this.identifier(column)}` : this.identifier(column);
    return value === null || value === undefined ? `${name} IS NULL` : `${name} = ${this.value(value)}`;
  }

  /** unquoted names are folded to lower case - other names must be quoted */
  completionName(name: string): string {
    return /^[a-z_][a-z0-9_$]*$/.test(name) ? name : this.identifier(name);
  }
}

export default PostgresSqlLiteral;
