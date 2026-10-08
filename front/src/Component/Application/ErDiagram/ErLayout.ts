import TableInformationInterface from '../../../Library/Table/Interface/TableInformationInterface';

export const HEADER_HEIGHT = 26;
export const ROW_HEIGHT = 18;
const CHAR_WIDTH = 7;
const COLUMN_GAP = 90;
const TABLE_GAP = 28;
/** taller column of tables is wrapped into next column */
const MAX_COLUMN_HEIGHT = 1400;

export type BoxType = {x: number, y: number, width: number, height: number};

/** one relation line - column of table points to column of referenced table */
export type RelationType = {from: string, fromColumn: string, to: string, toColumn: string};

export const tableHeight = (table: TableInformationInterface): number => HEADER_HEIGHT + Math.max(1, table.columns.length) * ROW_HEIGHT + 6;

export const tableWidth = (table: TableInformationInterface): number => {
  const longest = Math.max(
    table.tableName.length + 2,
    ...table.columns.map((column) => column.name.length + (column.type || '').length + 6),
  );
  return Math.min(380, Math.max(150, longest * CHAR_WIDTH + 16));
};

/** foreign keys of tables in diagram (references to other databases are left out) */
export const relationsOf = (tables: TableInformationInterface[]): RelationType[] => {
  const names = new Set(tables.map((table) => table.tableName));
  return tables.flatMap((table) => table.columns
    .filter((column) => column.reference && column.reference.table.databaseName === table.dataBaseName && names.has(column.reference.table.name))
    .map((column) => ({from: table.tableName, fromColumn: column.name, to: column.reference!.table.name, toColumn: column.reference!.columnName})));
};

/**
 * Layered layout - referenced tables are left of tables pointing to them.
 * Tables without any relation are placed in grid after related ones.
 */
export const autoLayout = (tables: TableInformationInterface[], relations: RelationType[]): {[table: string]: BoxType} => {
  const level = new Map<string, number>();
  const visiting = new Set<string>();
  const levelOf = (name: string): number => {
    if (level.has(name)) return level.get(name)!;
    if (visiting.has(name)) return 0;
    visiting.add(name);
    const referenced = relations.filter((relation) => relation.from === name && relation.to !== name);
    const value = referenced.length ? 1 + Math.max(...referenced.map((relation) => levelOf(relation.to))) : 0;
    visiting.delete(name);
    level.set(name, value);
    return value;
  };

  const related = new Set(relations.flatMap((relation) => [relation.from, relation.to]));
  const connected = tables.filter((table) => related.has(table.tableName));
  const isolated = tables.filter((table) => !related.has(table.tableName));
  const boxes: {[table: string]: BoxType} = {};

  // columns of layers, long layer is wrapped
  let x = 20;
  const levels = Array.from(new Set(connected.map((table) => levelOf(table.tableName)))).sort((a, b) => a - b);
  levels.forEach((current) => {
    const inLevel = connected.filter((table) => levelOf(table.tableName) === current).sort((a, b) => a.tableName.localeCompare(b.tableName));
    let y = 20;
    let columnWidth = 0;
    inLevel.forEach((table) => {
      const height = tableHeight(table);
      if (y > 20 && y + height > MAX_COLUMN_HEIGHT) {
        x += columnWidth + COLUMN_GAP;
        y = 20;
        columnWidth = 0;
      }
      const width = tableWidth(table);
      boxes[table.tableName] = {x, y, width, height};
      y += height + TABLE_GAP;
      columnWidth = Math.max(columnWidth, width);
    });
    x += columnWidth + COLUMN_GAP;
  });

  // tables without relations - rows of grid
  const startX = connected.length ? x + 40 : 20;
  const perRow = Math.max(1, Math.ceil(Math.sqrt(isolated.length)));
  let rowY = 20;
  for (let index = 0; index < isolated.length; index += perRow) {
    const row = isolated.slice(index, index + perRow);
    let rowX = startX;
    row.forEach((table) => {
      const width = tableWidth(table);
      boxes[table.tableName] = {x: rowX, y: rowY, width, height: tableHeight(table)};
      rowX += width + TABLE_GAP;
    });
    rowY += Math.max(...row.map(tableHeight)) + TABLE_GAP;
  }
  return boxes;
};
