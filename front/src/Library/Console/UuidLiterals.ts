import SqlDialectType from '../Database/Driver/SqlDialectType';
import {hexOfUuidInput} from '../Record/Uuid';
import {SqlTokenType, tokenizeSql} from './SqlTokenizer';
import {tableReferences} from './SqlInspections';

/**
 * UUID pasted as text and compared with BINARY(16) column of MySQL / MariaDB never matches: 36 characters
 * are not 16 bytes. Such strings are replaced by X'hex' before the statement is sent - the same bytes as
 * UUID shown in grid (order of bytes as stored, UUID_TO_BIN(uuid, 1) is not reversed).
 * Recognized: column = / <> / != / <=> 'uuid' (both sides, also SET column = 'uuid'), column [NOT] IN ('uuid', ...)
 * and values of INSERT INTO table (columns) VALUES (...).
 * PostgreSQL has type uuid - bytea can keep any bytes, so its strings are not changed.
 */

export type UuidColumnType = {name: string, type?: string};
/** columns of table, undefined when table is not known (list of tables not loaded) */
export type UuidTableLookupType = (database: string | null, table: string) => UuidColumnType[] | undefined;

const BINARY_16 = /^(var)?binary\(16\)$/i;

const isName = (token: SqlTokenType | undefined): boolean => !!token && (token.type === 'word' || token.type === 'quoted');
const upper = (token: SqlTokenType | undefined): string => token?.type === 'word' ? token.value.toUpperCase() : '';
const is = (token: SqlTokenType | undefined, value: string): boolean => !!token && token.type === 'symbol' && token.value === value;

/** hex of 'uuid' string token, null for other strings */
const uuidHexOf = (token: SqlTokenType): string | null => {
  const match = /^'([^'\\]*)'$|^"([^"\\]*)"$/.exec(token.value);
  return match ? hexOfUuidInput(match[1] ?? match[2]) : null;
};

type ColumnReferenceType = {qualifier: string | null, column: SqlTokenType};

/** column which ends at token index - column, alias.column, database.table.column */
const columnEndingAt = (tokens: SqlTokenType[], index: number): ColumnReferenceType | null => {
  const column = tokens[index];
  if (!isName(column) || tokens[index - 1]?.value === '@') return null;
  if (is(tokens[index - 1], '.') && isName(tokens[index - 2])) return {qualifier: tokens[index - 2].value, column};
  return {qualifier: null, column};
};

/** column which starts at token index */
const columnStartingAt = (tokens: SqlTokenType[], index: number): ColumnReferenceType | null => {
  let position = index;
  while (is(tokens[position + 1], '.') && isName(tokens[position + 2])) position += 2;
  if (!isName(tokens[position]) || is(tokens[position + 1], '(')) return null;
  return columnEndingAt(tokens, position);
};

/** index of column end before comparison operator which ends before token index, -1 without operator */
const beforeOperator = (tokens: SqlTokenType[], index: number): number => {
  const previous = tokens[index - 1];
  if (is(previous, '=') || is(previous, '<>') || is(previous, '!=')) return index - 2;
  if (is(previous, '>') && is(tokens[index - 2], '<=') && previous.start === tokens[index - 2].end) return index - 3;
  return -1;
};

/** index of column start after comparison operator which starts after token index, -1 without operator */
const afterOperator = (tokens: SqlTokenType[], index: number): number => {
  const next = tokens[index + 1];
  if (is(next, '=') || is(next, '<>') || is(next, '!=')) return index + 2;
  if (is(next, '<=') && is(tokens[index + 2], '>') && next.end === tokens[index + 2].start) return index + 3;
  return -1;
};

/** column of IN (..., 'uuid', ...) list */
const inListColumn = (tokens: SqlTokenType[], index: number): ColumnReferenceType | null => {
  let position = index - 1;
  while (position >= 0 && (tokens[position].type === 'string' || is(tokens[position], ','))) position--;
  if (!is(tokens[position], '(') || upper(tokens[position - 1]) !== 'IN') return null;
  for (let next = index + 1; next < tokens.length && !is(tokens[next], ')'); next++) {
    if (tokens[next].type !== 'string' && !is(tokens[next], ',')) return null;
  }
  const end = upper(tokens[position - 2]) === 'NOT' ? position - 3 : position - 2;
  return is(tokens[end], ')') ? null : columnEndingAt(tokens, end);
};

/** INSERT / REPLACE INTO table (columns) VALUES (...), (...) - string token index -> its column */
const insertedColumns = (tokens: SqlTokenType[], lookup: UuidTableLookupType): Map<number, UuidColumnType> => {
  const result = new Map<number, UuidColumnType>();
  tokens.forEach((token, index) => {
    if (upper(token) !== 'INTO' || !isName(tokens[index + 1])) return;
    const qualified = is(tokens[index + 2], '.') && isName(tokens[index + 3]);
    const database = qualified ? tokens[index + 1].value : null;
    const table = qualified ? tokens[index + 3] : tokens[index + 1];
    let position = qualified ? index + 4 : index + 2;
    if (!is(tokens[position], '(')) return;
    const names: string[] = [];
    for (position++; position < tokens.length && !is(tokens[position], ')'); position++) {
      if (isName(tokens[position])) names.push(tokens[position].value);
    }
    if (!/^VALUES?$/.test(upper(tokens[position + 1]))) return;
    const columns = lookup(database, table.value);
    if (!columns) return;
    const typed = names.map((name) => columns.find((column) => column.name.toLowerCase() === name.toLowerCase()));
    position += 2;
    // groups of values: ('a', 'b'), ('c', 'd')
    while (is(tokens[position], '(')) {
      let depth = 1;
      let item = 0;
      for (position++; position < tokens.length && depth > 0; position++) {
        const current = tokens[position];
        if (is(current, '(')) depth++;
        else if (is(current, ')')) depth--;
        else if (depth === 1 && is(current, ',')) item++;
        else if (depth === 1 && current.type === 'string' && (is(tokens[position - 1], '(') || is(tokens[position - 1], ','))
          && (is(tokens[position + 1], ',') || is(tokens[position + 1], ')')) && typed[item]) {
          result.set(position, typed[item]!);
        }
      }
      if (!is(tokens[position], ',')) break;
      position++;
    }
  });
  return result;
};

/**
 * statement with UUID strings compared with / written to BINARY(16) columns as X'hex';
 * columns - names of converted columns (empty when nothing changed)
 */
export const binaryUuidLiterals = (sql: string, dialect: SqlDialectType, lookup: UuidTableLookupType): {sql: string, columns: string[]} => {
  if (dialect !== 'mysql' || !/[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}/i.test(sql)) return {sql, columns: []};
  const tokens = tokenizeSql(sql, dialect);
  /** alias or table name -> its columns */
  const sources = new Map<string, UuidColumnType[]>();
  tableReferences(tokens).forEach((reference) => {
    const columns = lookup(reference.database, reference.name);
    if (!columns) return;
    sources.set(reference.name.toLowerCase(), columns);
    if (reference.alias) sources.set(reference.alias.toLowerCase(), columns);
  });
  const columnOf = (reference: ColumnReferenceType | null): UuidColumnType | null => {
    if (!reference) return null;
    const find = (columns: UuidColumnType[]) => columns.find((column) => column.name.toLowerCase() === reference.column.value.toLowerCase());
    if (reference.qualifier) {
      const columns = sources.get(reference.qualifier.toLowerCase());
      return columns ? find(columns) || null : null;
    }
    // column without alias - every table of statement which has it must have it binary
    const found = Array.from(new Set(sources.values())).map(find).filter((column): column is UuidColumnType => !!column);
    return found.length && found.every((column) => BINARY_16.test(column.type || '')) ? found[0] : null;
  };
  const inserted = insertedColumns(tokens, lookup);

  const replacements: {token: SqlTokenType, hex: string, column: string}[] = [];
  tokens.forEach((token, index) => {
    if (token.type !== 'string') return;
    const hex = uuidHexOf(token);
    if (!hex) return;
    const before = beforeOperator(tokens, index);
    const after = afterOperator(tokens, index);
    const column = inserted.get(index)
      || (before >= 0 ? columnOf(columnEndingAt(tokens, before)) : null)
      || (after >= 0 ? columnOf(columnStartingAt(tokens, after)) : null)
      || columnOf(inListColumn(tokens, index));
    if (column && BINARY_16.test(column.type || '')) replacements.push({token, hex, column: column.name});
  });
  if (!replacements.length) return {sql, columns: []};

  let result = sql;
  [...replacements].reverse().forEach(({token, hex}) => {
    result = `${result.slice(0, token.start)}X'${hex}'${result.slice(token.end)}`;
  });
  return {sql: result, columns: Array.from(new Set(replacements.map((item) => item.column)))};
};
