import TableInterface from '../../Interface/Data/TableInterface';
import {
  AlterOperationType,
  ColumnDefinitionInterface,
  ColumnPositionType,
  StructureChangeType,
} from '../../Interface/Data/StructureChangeInterface';
const mysql = require('mysql');

/** CURRENT_TIMESTAMP family is allowed without parentheses, also on older servers */
const TIMESTAMP_EXPRESSION = /^(current_timestamp|now|localtime|localtimestamp)(\(\s*\d*\s*\))?$/i;

/**
 * Builds DDL for MySQL / MariaDB. Names and values are escaped,
 * column type and default expression are written as they are - they are validated not to contain statement breaks.
 * @author Mateusz Bochen
 */
class MysqlDdlBuilder {

  /** copyColumns - columns copied with data, generated columns are left out */
  static build(table: TableInterface, change: StructureChangeType, copyColumns?: string[]): string[] {
    const tableName = MysqlDdlBuilder.tableName(table);

    switch (change.kind) {
      case 'alter':
        if (!change.operations?.length) {
          throw new Error('Nothing to change');
        }
        return [`ALTER TABLE ${tableName}\n  ${change.operations.map(MysqlDdlBuilder.alterOperation).join(',\n  ')}`];
      case 'truncate':
        return [`TRUNCATE TABLE ${tableName}`];
      case 'drop':
        return [`DROP TABLE ${tableName}`];
      case 'rename':
        return [`RENAME TABLE ${tableName} TO ${MysqlDdlBuilder.tableName({...table, name: MysqlDdlBuilder.requireName(change.newName, 'New table name')})}`];
      case 'copy': {
        const copy = MysqlDdlBuilder.tableName({...table, name: MysqlDdlBuilder.requireName(change.newName, 'New table name')});
        const statements = [`CREATE TABLE ${copy} LIKE ${tableName}`];
        if (change.withData) {
          const columns = copyColumns?.length ? mysql.escapeId(copyColumns) : null;
          statements.push(columns
            ? `INSERT INTO ${copy} (${columns}) SELECT ${columns} FROM ${tableName}`
            : `INSERT INTO ${copy} SELECT * FROM ${tableName}`);
        }
        return statements;
      }
      default:
        throw new Error(`Unknown structure change ${(change as StructureChangeType).kind}`);
    }
  }

  private static alterOperation(operation: AlterOperationType): string {
    switch (operation.op) {
      case 'addColumn':
        return `ADD COLUMN ${MysqlDdlBuilder.columnDefinition(operation.column)}${MysqlDdlBuilder.position(operation.position)}`;
      case 'changeColumn':
        return `CHANGE COLUMN ${mysql.escapeId(MysqlDdlBuilder.requireName(operation.name, 'Column name'))} `
          + `${MysqlDdlBuilder.columnDefinition(operation.column)}${MysqlDdlBuilder.position(operation.position)}`;
      case 'dropColumn':
        return `DROP COLUMN ${mysql.escapeId(MysqlDdlBuilder.requireName(operation.name, 'Column name'))}`;
      case 'addIndex': {
        if (!operation.columns?.length) {
          throw new Error('Index needs at least one column');
        }
        const columns = operation.columns.map((column) => {
          const length = column.length ? `(${MysqlDdlBuilder.positiveInteger(column.length, 'Index length')})` : '';
          return `${mysql.escapeId(MysqlDdlBuilder.requireName(column.name, 'Index column'))}${length}`;
        }).join(', ');
        if (operation.kind === 'PRIMARY') {
          return `ADD PRIMARY KEY (${columns})`;
        }
        const kind = {INDEX: 'INDEX', UNIQUE: 'UNIQUE INDEX', FULLTEXT: 'FULLTEXT INDEX'}[operation.kind];
        if (!kind) {
          throw new Error(`Unknown index kind ${operation.kind}`);
        }
        const name = operation.name?.trim() ? ` ${mysql.escapeId(operation.name.trim())}` : '';
        return `ADD ${kind}${name} (${columns})`;
      }
      case 'dropIndex':
        return operation.name === 'PRIMARY'
          ? 'DROP PRIMARY KEY'
          : `DROP INDEX ${mysql.escapeId(MysqlDdlBuilder.requireName(operation.name, 'Index name'))}`;
      default:
        throw new Error(`Unknown operation ${(operation as AlterOperationType).op}`);
    }
  }

  private static columnDefinition(column: ColumnDefinitionInterface): string {
    const parts = [
      mysql.escapeId(MysqlDdlBuilder.requireName(column?.name, 'Column name')),
      MysqlDdlBuilder.rawPart(column.type, 'Column type'),
    ];
    if (column.collation) {
      if (!/^[A-Za-z0-9_]+$/.test(column.collation)) {
        throw new Error(`Invalid collation ${column.collation}`);
      }
      parts.push(`COLLATE ${column.collation}`);
    }
    parts.push(column.nullable ? 'NULL' : 'NOT NULL');

    const defaultValue = column.defaultValue || {kind: 'none'};
    switch (defaultValue.kind) {
      case 'null':
        parts.push('DEFAULT NULL');
        break;
      case 'value':
        parts.push(`DEFAULT ${mysql.escape(defaultValue.value)}`);
        break;
      case 'expression': {
        const expression = MysqlDdlBuilder.rawPart(defaultValue.value, 'Default expression');
        // MySQL 8 / MariaDB need other expressions in parentheses
        parts.push(`DEFAULT ${TIMESTAMP_EXPRESSION.test(expression) ? expression : `(${expression})`}`);
        break;
      }
    }

    if (column.onUpdateCurrentTimestamp) {
      parts.push('ON UPDATE CURRENT_TIMESTAMP');
    }
    if (column.autoIncrement) {
      parts.push('AUTO_INCREMENT');
    }
    if (column.comment) {
      parts.push(`COMMENT ${mysql.escape(column.comment)}`);
    }
    return parts.join(' ');
  }

  private static position(position?: ColumnPositionType): string {
    if (!position || position.kind === 'end') {
      return '';
    }
    if (position.kind === 'first') {
      return ' FIRST';
    }
    return ` AFTER ${mysql.escapeId(MysqlDdlBuilder.requireName(position.column, 'Column'))}`;
  }

  private static tableName(table: TableInterface): string {
    return `${mysql.escapeId(MysqlDdlBuilder.requireName(table.databaseName, 'Database'))}.${mysql.escapeId(MysqlDdlBuilder.requireName(table.name, 'Table name'))}`;
  }

  private static requireName(name: string | undefined, label: string): string {
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error(`${label} is required`);
    }
    return name.trim();
  }

  private static positiveInteger(value: number, label: string): number {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${label} must be positive number`);
    }
    return value;
  }

  /** type / expression is written into sql as it is - must stay one part of one statement */
  private static rawPart(value: string | undefined, label: string): string {
    const text = MysqlDdlBuilder.requireName(value, label);
    // strings in type (enum values) may contain anything, check only the rest
    const withoutStrings = text.replace(/'(?:[^'\\]|''|\\.)*'/g, "''");
    if (/[;`]|--|\/\*|#/.test(withoutStrings) || /'/.test(withoutStrings.replace(/''/g, ''))) {
      throw new Error(`${label} contains not allowed characters: ${text}`);
    }
    let depth = 0;
    for (const char of withoutStrings) {
      depth += char === '(' ? 1 : char === ')' ? -1 : 0;
      if (depth < 0) break;
    }
    if (depth !== 0) {
      throw new Error(`${label} has unbalanced parentheses: ${text}`);
    }
    return text;
  }
}

export default MysqlDdlBuilder;
