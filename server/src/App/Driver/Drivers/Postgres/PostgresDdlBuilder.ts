import TableInterface from '../../Interface/Data/TableInterface';
import {
  AlterOperationType,
  ColumnDefaultType,
  ColumnDefinitionInterface,
  ColumnPositionType,
  StructureChangeType,
} from '../../Interface/Data/StructureChangeInterface';
import PostgresSql from './PostgresSql';
import PostgresCatalog, {CatalogColumnInterface} from './PostgresCatalog';

/**
 * Builds DDL for PostgreSQL. Names and values are escaped,
 * column type and default expression are written as they are - they are validated not to contain statement breaks.
 * Current structure is read from catalog - change of column is written as difference to it.
 * @author Mateusz Bochen
 */
class PostgresDdlBuilder {
  constructor(private readonly catalog: PostgresCatalog) {
  }

  async build(table: TableInterface, change: StructureChangeType): Promise<string[]> {
    const tableName = PostgresDdlBuilder.tableName(table);

    switch (change.kind) {
      case 'alter':
        return this.alter(table, change.operations);
      case 'truncate':
        // the same as MySQL - auto increment starts again
        return [`TRUNCATE TABLE ${tableName} RESTART IDENTITY`];
      case 'drop': {
        const kind = await this.relationKind(table);
        const object = kind === 'v' ? 'VIEW' : kind === 'm' ? 'MATERIALIZED VIEW' : kind === 'f' ? 'FOREIGN TABLE' : 'TABLE';
        return [`DROP ${object} ${tableName}`];
      }
      case 'rename': {
        const newName = PostgresDdlBuilder.requireName(change.newName, 'New table name');
        const kind = await this.relationKind(table);
        const object = kind === 'v' ? 'VIEW' : kind === 'm' ? 'MATERIALIZED VIEW' : 'TABLE';
        return [`ALTER ${object} ${tableName} RENAME TO ${PostgresSql.identifier(newName)}`];
      }
      case 'copy':
        return this.copy(table, PostgresDdlBuilder.requireName(change.newName, 'New table name'), change.withData);
      default:
        throw new Error(`Unknown structure change ${(change as StructureChangeType).kind}`);
    }
  }

  /** one ALTER TABLE for column changes, renames and comments after it (DDL is transactional) */
  private async alter(table: TableInterface, operations: AlterOperationType[]): Promise<string[]> {
    if (!operations?.length) {
      throw new Error('Nothing to change');
    }
    const tableName = PostgresDdlBuilder.tableName(table);
    const columns = await this.catalog.columns(table.databaseName, [table.name]);
    const clauses: string[] = [];
    const before: string[] = [];
    const after: string[] = [];

    for (const operation of operations) {
      switch (operation.op) {
        case 'addColumn': {
          PostgresDdlBuilder.checkPosition(operation.position);
          const column = operation.column;
          clauses.push(`ADD COLUMN ${PostgresDdlBuilder.columnDefinition(column)}`);
          if (column.comment) {
            after.push(PostgresDdlBuilder.comment(tableName, column.name, column.comment));
          }
          break;
        }
        case 'changeColumn': {
          PostgresDdlBuilder.checkPosition(operation.position);
          const name = PostgresDdlBuilder.requireName(operation.name, 'Column name');
          const current = columns.find((column) => column.name === name);
          if (!current) {
            throw new Error(`Column ${name} does not exist`);
          }
          const changes = PostgresDdlBuilder.columnChanges(current, operation.column);
          clauses.push(...changes.clauses);
          const newName = PostgresDdlBuilder.requireName(operation.column.name, 'Column name');
          if (newName !== name) {
            after.push(`ALTER TABLE ${tableName} RENAME COLUMN ${PostgresSql.identifier(name)} TO ${PostgresSql.identifier(newName)}`);
          }
          if ((operation.column.comment || '') !== current.comment) {
            after.push(PostgresDdlBuilder.comment(tableName, newName, operation.column.comment));
          }
          break;
        }
        case 'dropColumn':
          clauses.push(`DROP COLUMN ${PostgresSql.identifier(PostgresDdlBuilder.requireName(operation.name, 'Column name'))}`);
          break;
        case 'addIndex': {
          if (!operation.columns?.length) {
            throw new Error('Index needs at least one column');
          }
          if (operation.columns.some((column) => column.length)) {
            throw new Error('PostgreSQL does not support prefix length of index columns - use expression index in SQL console');
          }
          const indexColumns = operation.columns.map((column) => PostgresSql.identifier(PostgresDdlBuilder.requireName(column.name, 'Index column'))).join(', ');
          if (operation.kind === 'PRIMARY') {
            clauses.push(`ADD PRIMARY KEY (${indexColumns})`);
            break;
          }
          if (operation.kind === 'FULLTEXT') {
            throw new Error('FULLTEXT index is not supported in PostgreSQL - use GIN index on to_tsvector() in SQL console');
          }
          if (operation.kind !== 'INDEX' && operation.kind !== 'UNIQUE') {
            throw new Error(`Unknown index kind ${operation.kind}`);
          }
          const indexName = operation.name?.trim() ? ` ${PostgresSql.identifier(operation.name.trim())}` : '';
          after.push(`CREATE ${operation.kind === 'UNIQUE' ? 'UNIQUE ' : ''}INDEX${indexName} ON ${tableName} (${indexColumns})`);
          break;
        }
        case 'dropIndex': {
          const name = PostgresDdlBuilder.requireName(operation.name, 'Index name');
          const index = (await this.catalog.indexes(table.databaseName, table.name)).find((item) => item.name === name);
          if (!index) {
            throw new Error(`Index ${name} does not exist`);
          }
          // index of primary key / unique constraint is removed with the constraint
          if (index.constraint) {
            clauses.push(`DROP CONSTRAINT ${PostgresSql.identifier(index.constraint)}`);
          } else {
            before.push(`DROP INDEX ${PostgresSql.table(table.databaseName, name)}`);
          }
          break;
        }
        default:
          throw new Error(`Unknown operation ${(operation as AlterOperationType).op}`);
      }
    }

    const statements = [...before];
    if (clauses.length) {
      statements.push(`ALTER TABLE ${tableName}\n  ${clauses.join(',\n  ')}`);
    }
    statements.push(...after);
    if (!statements.length) {
      throw new Error('Nothing to change');
    }
    return statements;
  }

  /** ALTER COLUMN clauses for differences between current column and new definition */
  private static columnChanges(current: CatalogColumnInterface, column: ColumnDefinitionInterface): {clauses: string[]} {
    if (column.onUpdateCurrentTimestamp) {
      throw new Error('ON UPDATE CURRENT_TIMESTAMP is not supported in PostgreSQL - use trigger');
    }
    const name = PostgresSql.identifier(current.name);
    const clauses: string[] = [];
    const type = PostgresDdlBuilder.rawPart(column.type, 'Column type');

    if (current.generated) {
      // only name and comment of generated column can be changed here
      return {clauses};
    }

    if (type.toLowerCase() !== current.type.toLowerCase() || (column.collation || null) !== (current.collation || null)) {
      const collation = column.collation ? ` COLLATE ${PostgresSql.identifier(column.collation)}` : '';
      // explicit cast - text to number etc. is not converted automatically
      clauses.push(`ALTER COLUMN ${name} TYPE ${type}${collation} USING ${name}::${type}`);
    }
    if (column.nullable !== current.nullable) {
      clauses.push(`ALTER COLUMN ${name} ${column.nullable ? 'DROP' : 'SET'} NOT NULL`);
    }

    const wasAuto = !!current.identity || current.serial;
    if (column.autoIncrement && !wasAuto) {
      clauses.push(`ALTER COLUMN ${name} ADD GENERATED BY DEFAULT AS IDENTITY`);
    } else if (!column.autoIncrement && current.identity) {
      clauses.push(`ALTER COLUMN ${name} DROP IDENTITY`);
    }

    // default of identity column is the sequence
    if (!column.autoIncrement || current.serial) {
      const wanted = PostgresDdlBuilder.defaultSql(column.defaultValue);
      const now = current.defaultExpression === null ? null : current.defaultExpression;
      const currentKind: ColumnDefaultType['kind'] = now === null ? 'none' : current.defaultLiteral !== null ? 'value' : 'expression';
      const sameDefault = (wanted === null && now === null)
        || (column.defaultValue?.kind === 'value' && currentKind === 'value' && column.defaultValue.value === current.defaultLiteral)
        || (column.defaultValue?.kind === 'expression' && currentKind === 'expression' && column.defaultValue.value.trim() === now)
        || (column.defaultValue?.kind === 'null' && now === null);
      if (!sameDefault) {
        clauses.push(wanted === null ? `ALTER COLUMN ${name} DROP DEFAULT` : `ALTER COLUMN ${name} SET DEFAULT ${wanted}`);
      }
    }
    return {clauses};
  }

  /** CREATE TABLE ... (LIKE ... INCLUDING ALL), data are copied with new identity values continuing after copied ones */
  private async copy(table: TableInterface, newName: string, withData: boolean): Promise<string[]> {
    const source = PostgresDdlBuilder.tableName(table);
    const copy = PostgresDdlBuilder.tableName({...table, name: newName});
    const statements = [`CREATE TABLE ${copy} (LIKE ${source} INCLUDING ALL)`];
    if (!withData) {
      return statements;
    }
    const columns = (await this.catalog.columns(table.databaseName, [table.name])).filter((column) => !column.generated);
    const list = PostgresSql.identifiers(columns.map((column) => column.name));
    const overriding = columns.some((column) => column.identity === 'a') ? ' OVERRIDING SYSTEM VALUE' : '';
    statements.push(`INSERT INTO ${copy} (${list})${overriding} SELECT ${list} FROM ${source}`);
    // LIKE creates new sequence for identity columns - it would start at 1
    columns.filter((column) => column.identity).forEach((column) => {
      const id = PostgresSql.identifier(column.name);
      statements.push(`SELECT setval(pg_get_serial_sequence(${PostgresSql.literal(copy)}, ${PostgresSql.literal(column.name)}), COALESCE(MAX(${id}), 0) + 1, false) FROM ${copy}`);
    });
    return statements;
  }

  private static columnDefinition(column: ColumnDefinitionInterface): string {
    if (column.onUpdateCurrentTimestamp) {
      throw new Error('ON UPDATE CURRENT_TIMESTAMP is not supported in PostgreSQL - use trigger');
    }
    const parts = [
      PostgresSql.identifier(PostgresDdlBuilder.requireName(column?.name, 'Column name')),
      PostgresDdlBuilder.rawPart(column.type, 'Column type'),
    ];
    if (column.collation) {
      parts.push(`COLLATE ${PostgresSql.identifier(column.collation)}`);
    }
    if (column.autoIncrement) {
      parts.push('GENERATED BY DEFAULT AS IDENTITY');
    } else {
      const defaultSql = PostgresDdlBuilder.defaultSql(column.defaultValue);
      if (defaultSql !== null) {
        parts.push(`DEFAULT ${defaultSql}`);
      }
    }
    parts.push(column.nullable && !column.autoIncrement ? 'NULL' : 'NOT NULL');
    return parts.join(' ');
  }

  private static defaultSql(value: ColumnDefaultType | undefined): string | null {
    const defaultValue = value || {kind: 'none'};
    switch (defaultValue.kind) {
      case 'null':
        return 'NULL';
      case 'value':
        return PostgresSql.literal(defaultValue.value);
      case 'expression':
        return PostgresDdlBuilder.rawPart(defaultValue.value, 'Default expression');
      default:
        return null;
    }
  }

  private static comment(tableName: string, column: string, comment: string): string {
    return `COMMENT ON COLUMN ${tableName}.${PostgresSql.identifier(column)} IS ${comment ? PostgresSql.literal(comment) : 'NULL'}`;
  }

  /** PostgreSQL keeps columns in order of creation */
  private static checkPosition(position?: ColumnPositionType): void {
    if (position && position.kind !== 'end') {
      throw new Error('PostgreSQL cannot place column at chosen position - columns are always added at the end');
    }
  }

  private async relationKind(table: TableInterface): Promise<string> {
    const relation = (await this.catalog.relations(table.databaseName)).find((item) => item.name === table.name);
    if (!relation) {
      throw new Error(`Table ${table.databaseName}.${table.name} does not exist`);
    }
    return relation.kind;
  }

  private static tableName(table: TableInterface): string {
    return PostgresSql.table(
      PostgresDdlBuilder.requireName(table.databaseName, 'Schema'),
      PostgresDdlBuilder.requireName(table.name, 'Table name'),
    );
  }

  private static requireName(name: string | undefined, label: string): string {
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error(`${label} is required`);
    }
    return name.trim();
  }

  /** type / expression is written into sql as it is - must stay one part of one statement */
  private static rawPart(value: string | undefined, label: string): string {
    const text = PostgresDdlBuilder.requireName(value, label);
    // strings and quoted names may contain anything, check only the rest
    const withoutQuoted = text.replace(/'(?:[^']|'')*'/g, "''").replace(/"(?:[^"]|"")*"/g, '""');
    if (/;|--|\/\*|\$/.test(withoutQuoted) || /['"]/.test(withoutQuoted.replace(/''|""/g, ''))) {
      throw new Error(`${label} contains not allowed characters: ${text}`);
    }
    let depth = 0;
    for (const char of withoutQuoted) {
      depth += char === '(' ? 1 : char === ')' ? -1 : 0;
      if (depth < 0) break;
    }
    if (depth !== 0) {
      throw new Error(`${label} has unbalanced parentheses: ${text}`);
    }
    return text;
  }
}

export default PostgresDdlBuilder;
