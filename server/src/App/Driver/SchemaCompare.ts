import DriverInterface from './DriverInterface';
import TableStructureInterface, {
  StructureColumnInterface,
  StructureForeignKeyInterface,
  StructureIndexInterface,
} from './Interface/Data/TableStructureInterface';
import {AlterOperationType, ColumnDefinitionInterface, ColumnPositionType, IndexKindType} from './Interface/Data/StructureChangeInterface';
import {SchemaCompareResultInterface, SchemaTableDiffInterface} from './Interface/Data/SchemaCompareInterface';

/** tables whose structure is loaded at the same time */
const PARALLEL_TABLES = 4;

/** structure of every table (not views) of database */
const loadSchema = async (driver: DriverInterface, database: string): Promise<{tables: TableStructureInterface[], views: string[]}> => {
  const objects = await driver.getDatabaseObjects(database);
  const names = objects.tables.filter((table) => !table.isView).map((table) => table.name);
  const tables: TableStructureInterface[] = [];
  for (let index = 0; index < names.length; index += PARALLEL_TABLES) {
    tables.push(...await Promise.all(names.slice(index, index + PARALLEL_TABLES).map((name) => driver.getTableStructure({databaseName: database, name}))));
  }
  return {tables, views: objects.tables.filter((table) => table.isView).map((table) => table.name)};
};

const isAutoIncrement = (column: StructureColumnInterface): boolean => /auto_increment|identity|serial/i.test(column.extra);

/** column of source as definition for ALTER of target */
const definitionOf = (column: StructureColumnInterface): ColumnDefinitionInterface => ({
  name: column.name,
  type: column.type,
  nullable: column.nullable,
  defaultValue: column.defaultValue === null || isAutoIncrement(column)
    ? {kind: column.nullable && !isAutoIncrement(column) ? 'null' : 'none'}
    : column.defaultIsExpression
      // SHOW COLUMNS escapes apostrophes in MySQL expressions
      ? {kind: 'expression', value: column.defaultValue.replace(/\\'/g, "'")}
      : {kind: 'value', value: column.defaultValue},
  autoIncrement: isAutoIncrement(column),
  onUpdateCurrentTimestamp: /on update/i.test(column.extra),
  comment: column.comment || '',
  collation: column.collation,
});

/** differences of columns as text, empty when columns are the same */
const columnDifferences = (source: StructureColumnInterface, target: StructureColumnInterface): string[] => {
  const differences: string[] = [];
  const extra = (column: StructureColumnInterface) => column.extra.toLowerCase().replace(/default_generated/g, '').replace(/\s+/g, ' ').trim();
  if (source.type.toLowerCase() !== target.type.toLowerCase()) differences.push(`type ${target.type} → ${source.type}`);
  if (source.nullable !== target.nullable) differences.push(source.nullable ? 'nullable' : 'not null');
  if ((source.defaultValue ?? null) !== (target.defaultValue ?? null)) differences.push(`default ${target.defaultValue ?? 'none'} → ${source.defaultValue ?? 'none'}`);
  if (extra(source) !== extra(target)) differences.push(`${extra(target) || 'no extra'} → ${extra(source) || 'no extra'}`);
  if ((source.comment || '') !== (target.comment || '')) differences.push('comment');
  if (source.collation && target.collation && source.collation !== target.collation) differences.push(`collation ${target.collation} → ${source.collation}`);
  if ((source.generationExpression || '') !== (target.generationExpression || '')) differences.push('generated expression');
  return differences;
};

const indexSignature = (index: StructureIndexInterface): string => JSON.stringify([
  index.primary, index.unique, index.type.toUpperCase(), index.columns.map((column) => [column.name, column.subPart, column.descending]),
]);

const indexKind = (index: StructureIndexInterface): IndexKindType | null => {
  if (index.primary) return 'PRIMARY';
  if (/FULLTEXT/i.test(index.type)) return 'FULLTEXT';
  if (/SPATIAL|GIN|GIST|BRIN|HASH|SPGIST/i.test(index.type) || index.columns.some((column) => column.descending)) return null;
  return index.unique ? 'UNIQUE' : 'INDEX';
};

/** foreign key without its name - names given by database differ between servers */
const foreignKeySignature = (key: StructureForeignKeyInterface, database: string): string => JSON.stringify([
  key.columns, key.referencedTable.databaseName === database ? null : key.referencedTable.databaseName, key.referencedTable.name,
  key.referencedColumns, key.onDelete.toUpperCase(), key.onUpdate.toUpperCase(),
]);

/** CREATE TABLE of source for target database - names of source schema in DDL (PostgreSQL indexes) are changed to target */
const createStatements = (table: TableStructureInterface, sourceDatabase: string, targetDatabase: string, dialect: string): string[] => {
  const quote = (name: string) => dialect === 'postgresql' ? `"${name.replace(/"/g, '""')}"` : `\`${name.replace(/`/g, '``')}\``;
  // counter of AUTO_INCREMENT belongs to data of source
  const statements = table.ddl.split(/;\n\n/).map((sql) => sql.trim().replace(/\s+AUTO_INCREMENT=\d+/, '')).filter(Boolean);
  if (sourceDatabase === targetDatabase) return statements;
  const plain = /^[a-z_][a-z0-9_]*$/.test(sourceDatabase) ? new RegExp(`(?<![\\w"\`])${sourceDatabase}\\.`, 'g') : null;
  return statements.map((sql) => {
    let result = sql.split(`${quote(sourceDatabase)}.`).join(`${quote(targetDatabase)}.`);
    if (plain) result = result.replace(plain, `${quote(targetDatabase)}.`);
    return result;
  });
};

/** created tables in order of their foreign keys - referenced table first */
const orderByReferences = (tables: TableStructureInterface[]): TableStructureInterface[] => {
  const names = new Set(tables.map((table) => table.table.name));
  const done = new Set<string>();
  const ordered: TableStructureInterface[] = [];
  const visit = (table: TableStructureInterface, path: Set<string>) => {
    if (done.has(table.table.name) || path.has(table.table.name)) return;
    path.add(table.table.name);
    table.foreignKeys
      .filter((key) => names.has(key.referencedTable.name) && key.referencedTable.name !== table.table.name)
      .forEach((key) => visit(tables.find((item) => item.table.name === key.referencedTable.name)!, path));
    done.add(table.table.name);
    ordered.push(table);
  };
  tables.forEach((table) => visit(table, new Set()));
  return ordered;
};

const message = (error: any): string => error?.sqlMessage || error?.message || String(error);

/**
 * Differences of tables of source and target database and statements which change target to source.
 * Statements are built by target driver - its DDL of ALTER, its checks of current state.
 */
export const compareSchemas = async (
  source: DriverInterface,
  sourceDatabase: string,
  target: DriverInterface,
  targetDatabase: string,
): Promise<SchemaCompareResultInterface> => {
  if (source.dialect !== target.dialect) {
    throw new Error('Only databases of the same kind can be compared (MySQL / MariaDB with MySQL / MariaDB, PostgreSQL with PostgreSQL)');
  }
  const [from, to] = await Promise.all([loadSchema(source, sourceDatabase), loadSchema(target, targetDatabase)]);
  const targetByName = new Map(to.tables.map((table) => [table.table.name, table]));
  const sourceByName = new Map(from.tables.map((table) => [table.table.name, table]));
  const diffs: SchemaTableDiffInterface[] = [];
  const warnings: string[] = [];
  const tableOf = (name: string) => ({databaseName: targetDatabase, name});
  const build = async (diff: SchemaTableDiffInterface, operations: AlterOperationType[]): Promise<string[]> => {
    if (!operations.length) return [];
    try {
      return await target.buildStructureChangeStatements(tableOf(diff.name), {kind: 'alter', operations});
    } catch (e) {
      diff.warnings.push(message(e));
      return [];
    }
  };

  // new tables - referenced tables first
  for (const table of orderByReferences(from.tables.filter((item) => !targetByName.has(item.table.name)))) {
    diffs.push({
      name: table.table.name,
      status: 'create',
      changes: [`new table with ${table.columns.length} column(s)`],
      dropForeignKeys: [],
      statements: createStatements(table, sourceDatabase, targetDatabase, source.dialect),
      addForeignKeys: [],
      warnings: table.warnings,
    });
  }

  for (const table of from.tables) {
    const current = targetByName.get(table.table.name);
    if (!current) continue;
    const diff: SchemaTableDiffInterface = {name: table.table.name, status: 'alter', changes: [], dropForeignKeys: [], statements: [], addForeignKeys: [], warnings: [...table.warnings, ...current.warnings]};
    const operations: AlterOperationType[] = [];

    // columns: missing are added after the same column as in source, extra are dropped
    table.columns.forEach((column, index) => {
      const existing = current.columns.find((item) => item.name === column.name);
      if (column.generationExpression && (!existing || columnDifferences(column, existing).length)) {
        diff.warnings.push(`Generated column ${column.name} has to be changed in SQL console`);
        return;
      }
      if (!existing) {
        diff.changes.push(`add column ${column.name} ${column.type}`);
        // PostgreSQL has no order of columns - added at the end
        const position: ColumnPositionType = target.dialect === 'postgresql' ? {kind: 'end'} : index === 0 ? {kind: 'first'} : {kind: 'after', column: table.columns[index - 1].name};
        operations.push({op: 'addColumn', column: definitionOf(column), position});
        return;
      }
      const differences = columnDifferences(column, existing);
      if (differences.length) {
        diff.changes.push(`change column ${column.name}: ${differences.join(', ')}`);
        operations.push({op: 'changeColumn', name: column.name, column: definitionOf(column), position: {kind: 'end'}});
      }
    });
    current.columns.filter((column) => !table.columns.some((item) => item.name === column.name)).forEach((column) => {
      diff.changes.push(`drop column ${column.name}`);
      operations.push({op: 'dropColumn', name: column.name});
    });

    // indexes by name - changed index is dropped and added again
    const indexOperations: AlterOperationType[] = [];
    table.indexes.forEach((index) => {
      const existing = current.indexes.find((item) => item.name === index.name || (item.primary && index.primary));
      if (existing && indexSignature(existing) === indexSignature(index)) return;
      const kind = indexKind(index);
      if (!kind || index.columns.some((column) => /[()\s]/.test(column.name))) {
        diff.warnings.push(`Index ${index.name} (${index.type}) has to be created in SQL console`);
        return;
      }
      if (existing) {
        diff.changes.push(`change index ${index.name}`);
        indexOperations.push({op: 'dropIndex', name: existing.name});
      } else {
        diff.changes.push(`add ${kind === 'INDEX' ? 'index' : kind.toLowerCase() + ' index'} ${index.name}`);
      }
      indexOperations.push({op: 'addIndex', name: index.primary ? '' : index.name, kind, columns: index.columns.map((column) => ({name: column.name, length: column.subPart}))});
    });
    current.indexes.filter((index) => !table.indexes.some((item) => item.name === index.name || (item.primary && index.primary))).forEach((index) => {
      // index of foreign key is dropped with the key in MySQL
      diff.changes.push(`drop index ${index.name}`);
      indexOperations.push({op: 'dropIndex', name: index.name});
    });

    // foreign keys by columns and referenced table
    const sourceKeys = table.foreignKeys.map((key) => foreignKeySignature(key, sourceDatabase));
    const targetKeys = current.foreignKeys.map((key) => foreignKeySignature(key, targetDatabase));
    const dropKeys = current.foreignKeys.filter((key, index) => !sourceKeys.includes(targetKeys[index]));
    const addKeys = table.foreignKeys.filter((key, index) => !targetKeys.includes(sourceKeys[index]));
    dropKeys.forEach((key) => diff.changes.push(`drop foreign key ${key.name} (${key.columns.join(', ')}) → ${key.referencedTable.name}`));
    addKeys.forEach((key) => diff.changes.push(`add foreign key (${key.columns.join(', ')}) → ${key.referencedTable.name}`));

    if (!diff.changes.length && !diff.warnings.length) continue;
    diff.dropForeignKeys = await build(diff, dropKeys.map((key) => ({op: 'dropForeignKey', name: key.name})));
    // dropped columns can be part of dropped index - indexes first
    diff.statements = [...await build(diff, indexOperations.filter((operation) => operation.op === 'dropIndex')), ...await build(diff, operations),
      ...await build(diff, indexOperations.filter((operation) => operation.op === 'addIndex'))];
    diff.addForeignKeys = await build(diff, addKeys.map((key) => ({
      op: 'addForeignKey',
      name: current.foreignKeys.some((item) => item.name === key.name) && !dropKeys.some((item) => item.name === key.name) ? '' : key.name,
      columns: key.columns,
      referencedTable: key.referencedTable.databaseName === sourceDatabase ? tableOf(key.referencedTable.name) : key.referencedTable,
      referencedColumns: key.referencedColumns,
      onDelete: key.onDelete,
      onUpdate: key.onUpdate,
    })));
    diffs.push(diff);
  }

  // tables only in target
  for (const table of to.tables.filter((item) => !sourceByName.has(item.table.name))) {
    const diff: SchemaTableDiffInterface = {name: table.table.name, status: 'drop', changes: ['table is not in source'], dropForeignKeys: [], statements: [], addForeignKeys: [], warnings: []};
    try {
      diff.statements = await target.buildStructureChangeStatements(tableOf(table.table.name), {kind: 'drop'});
    } catch (e) {
      diff.warnings.push(message(e));
    }
    diffs.push(diff);
  }

  if (from.views.length || to.views.length) {
    warnings.push(`Views are not compared (${from.views.length} in source, ${to.views.length} in target)`);
  }
  return {
    source: sourceDatabase,
    target: targetDatabase,
    dialect: target.dialect,
    tables: diffs,
    same: from.tables.length - diffs.filter((diff) => diff.status === 'alter').length - diffs.filter((diff) => diff.status === 'create').length,
    warnings,
  };
};
