import SqlDialectType from '../Database/Driver/SqlDialectType';
import {SqlTokenType, tokenizeSql} from './SqlTokenizer';

export type SqlProblemType = {
  /** offsets in inspected text, end is exclusive */
  start: number;
  end: number;
  message: string;
};

/** tables of the selected database - names are checked only when the list is loaded */
export type SqlSchemaType = {
  database: string | null;
  /** null when not loaded */
  tables: {name: string, columns: string[]}[] | null;
};

/** words after table name which are not its alias */
const NOT_ALIAS = new Set([
  'WHERE', 'ON', 'USING', 'JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL', 'STRAIGHT_JOIN', 'OUTER',
  'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'EXCEPT', 'INTERSECT', 'MINUS', 'SET', 'WINDOW', 'FOR',
  'RETURNING', 'INTO', 'VALUES', 'VALUE', 'SELECT', 'PARTITION', 'USE', 'FORCE', 'IGNORE', 'LOCK', 'TABLESAMPLE',
  'WITH', 'FETCH', 'DEFAULT', 'LATERAL', 'ONLY', 'ROWS', 'CONFLICT', 'DO', 'AS', 'FROM', 'AND', 'OR', 'NOT',
]);

/** words which end list of tables after FROM */
const CLAUSE_END = new Set([
  'WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'EXCEPT', 'INTERSECT', 'WINDOW', 'FOR', 'RETURNING',
  'INTO', 'SET', 'FETCH', 'ON', 'USING', 'VALUES', 'SELECT', 'LOCK',
]);

const upper = (token: SqlTokenType | undefined): string => token?.type === 'word' ? token.value.toUpperCase() : '';
const isName = (token: SqlTokenType | undefined): boolean => !!token && (token.type === 'word' || token.type === 'quoted');

/** first statement keyword - after WITH ... AS (...) of common table expressions */
const mainKeyword = (tokens: SqlTokenType[]): {token: SqlTokenType, index: number} | null => {
  let depth = 0;
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.value === '(' && token.type === 'symbol') depth++;
    else if (token.value === ')' && token.type === 'symbol') depth--;
    else if (depth === 0 && /^(SELECT|INSERT|UPDATE|DELETE|REPLACE|MERGE)$/.test(upper(token))) return {token, index};
    else if (depth === 0 && index === 0 && upper(token) !== 'WITH') return null;
  }
  return null;
};

/** SELECT, INSERT, UPDATE, DELETE, REPLACE or MERGE of statement (also after WITH), null for other statements */
export const statementKeyword = (sql: string, dialect: SqlDialectType): string | null => {
  const main = mainKeyword(tokenizeSql(sql, dialect));
  return main ? upper(main.token) : null;
};

/** UPDATE or DELETE without WHERE changes every row of the table - its keyword token */
export const unsafeChangeOf = (sql: string, dialect: SqlDialectType): SqlTokenType | null => {
  const tokens = tokenizeSql(sql, dialect);
  const main = mainKeyword(tokens);
  if (!main || !/^(UPDATE|DELETE)$/.test(upper(main.token))) return null;
  let depth = 0;
  for (let index = main.index + 1; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.value === '(' && token.type === 'symbol') depth++;
    else if (token.value === ')' && token.type === 'symbol') depth--;
    // WHERE CURRENT OF cursor - one row
    else if (depth === 0 && upper(token) === 'WHERE') return null;
  }
  return main.token;
};

export type TableReferenceType = {database: string | null, name: string, quoted: boolean, start: number, end: number, alias: string | null};

/**
 * names of tables after FROM, JOIN, UPDATE and INTO (also lists after FROM a, b) and their aliases.
 * FROM inside function (EXTRACT(YEAR FROM date), TRIM(x FROM y)) is not a table - only subqueries are read.
 */
export const tableReferences = (tokens: SqlTokenType[]): TableReferenceType[] => {
  const references: TableReferenceType[] = [];
  /** for every open parenthesis: it is a subquery */
  const parentheses: boolean[] = [];
  /** depths of FROM whose list of tables is read - FROM a, (SELECT ... FROM b) x, c */
  const fromDepths = new Set<number>();
  const inQuery = () => !parentheses.length || parentheses[parentheses.length - 1];

  const read = (index: number) => {
    let position = index;
    while (/^(ONLY|LATERAL)$/.test(upper(tokens[position]))) position++;
    const first = tokens[position];
    if (!isName(first) || NOT_ALIAS.has(upper(first)) || tokens[position + 1]?.value === '(') return;
    let database: string | null = null;
    let name = first;
    if (tokens[position + 1]?.value === '.' && isName(tokens[position + 2])) {
      database = first.value;
      name = tokens[position + 2];
      position += 2;
      // function of schema - schema.function(...)
      if (tokens[position + 1]?.value === '(') return;
    }
    let alias: string | null = null;
    let next = tokens[position + 1];
    if (upper(next) === 'AS') next = tokens[position + 2];
    if (isName(next) && !NOT_ALIAS.has(upper(next))) alias = next!.value;
    references.push({database, name: name.value, quoted: name.type === 'quoted', start: name.start, end: name.end, alias});
  };

  tokens.forEach((token, index) => {
    const keyword = upper(token);
    if (token.type === 'symbol' && token.value === '(') {
      parentheses.push(/^(SELECT|WITH)$/.test(upper(tokens[index + 1])));
      return;
    }
    if (token.type === 'symbol' && token.value === ')') {
      fromDepths.delete(parentheses.length);
      parentheses.pop();
      return;
    }
    if (!inQuery()) return;
    if (keyword === 'FROM' || keyword === 'JOIN' || keyword === 'STRAIGHT_JOIN') {
      if (keyword === 'FROM') fromDepths.add(parentheses.length);
      read(index + 1);
    } else if (keyword === 'UPDATE' && upper(tokens[index - 1]) !== 'KEY' && upper(tokens[index - 1]) !== 'DO' && upper(tokens[index - 1]) !== 'FOR') {
      read(index + 1);
    } else if (keyword === 'INTO' && /^(INSERT|REPLACE|IGNORE)$/.test(upper(tokens[index - 1]))) {
      read(index + 1);
    } else if (token.type === 'symbol' && token.value === ',' && fromDepths.has(parentheses.length)) {
      read(index + 1);
    } else if (CLAUSE_END.has(keyword)) {
      fromDepths.delete(parentheses.length);
    }
  });
  return references;
};

/** names defined by the text itself: WITH name AS (...), CREATE TABLE / VIEW name */
const definedNames = (tokens: SqlTokenType[]): Set<string> => {
  const names = new Set<string>();
  tokens.forEach((token, index) => {
    if (!isName(token)) return;
    const next = tokens[index + 1];
    // name AS (  or  name (a, b) AS (
    if (upper(next) === 'AS' && tokens[index + 2]?.value === '(') names.add(token.value.toLowerCase());
    if (next?.value === '(' && upper(tokens[index - 1]) !== 'INTO') {
      let close = index + 1;
      while (close < tokens.length && tokens[close].value !== ')') close++;
      if (upper(tokens[close + 1]) === 'AS' && tokens[close + 2]?.value === '(') names.add(token.value.toLowerCase());
    }
    if (/^(TABLE|VIEW)$/.test(upper(token))) {
      let position = index + 1;
      while (/^(IF|NOT|EXISTS)$/.test(upper(tokens[position]))) position++;
      if (isName(tokens[position])) {
        const qualified = tokens[position + 1]?.value === '.' && isName(tokens[position + 2]);
        names.add((qualified ? tokens[position + 2] : tokens[position]).value.toLowerCase());
      }
    }
  });
  return names;
};

/**
 * problems of SQL text found without executing it:
 * UPDATE / DELETE without WHERE, unknown tables of the selected database and unknown columns of alias.column / INSERT INTO t (columns).
 * Names in other databases, system catalogs and names defined in the text (CTE, CREATE TABLE) are not checked.
 */
export const inspectSql = (text: string, statements: {sql: string, start: number}[], dialect: SqlDialectType, schema: SqlSchemaType): SqlProblemType[] => {
  const problems: SqlProblemType[] = [];
  const allTokens = tokenizeSql(text, dialect);
  const defined = definedNames(allTokens);
  const tables = schema.tables && schema.tables.length ? schema.tables : null;
  // PostgreSQL folds unquoted names to lower case, MySQL is compared without case (lower_case_table_names differs between servers)
  const key = (name: string, quoted: boolean): string => dialect === 'mysql' || !quoted ? name.toLowerCase() : name;
  const tableOf = (name: string, quoted: boolean) => tables?.find((table) => key(table.name, true) === key(name, quoted));

  statements.forEach((statement) => {
    const tokens = tokenizeSql(statement.sql, dialect);
    const unsafe = unsafeChangeOf(statement.sql, dialect);
    if (unsafe) {
      problems.push({start: statement.start + unsafe.start, end: statement.start + unsafe.end, message: `${unsafe.value.toUpperCase()} without WHERE changes all rows of the table`});
    }
    if (!tables) return;

    const references = tableReferences(tokens);
    /** alias (or table name) -> columns of its table, null for unknown source (subquery, other database) */
    const sources = new Map<string, string[] | null>();
    const addSource = (name: string, columns: string[] | null) => {
      const lower = name.toLowerCase();
      sources.set(lower, sources.has(lower) && JSON.stringify(sources.get(lower)) !== JSON.stringify(columns) ? null : columns);
    };
    references.forEach((reference) => {
      const sameDatabase = reference.database === null || reference.database === schema.database;
      const table = sameDatabase ? tableOf(reference.name, reference.quoted) : undefined;
      const systemName = dialect === 'postgresql' && /^pg_/i.test(reference.name) || dialect === 'mysql' && /^dual$/i.test(reference.name);
      if (sameDatabase && !table && !systemName && !defined.has(reference.name.toLowerCase())) {
        problems.push({start: statement.start + reference.start, end: statement.start + reference.end, message: `Unknown table ${reference.name} in ${schema.database}`});
      }
      const columns = table && table.columns.length ? table.columns : null;
      addSource(reference.name, columns);
      if (reference.alias) addSource(reference.alias, columns);
    });

    const columnProblem = (columns: string[], token: SqlTokenType, table: string) => {
      if (!columns.some((column) => key(column, true) === key(token.value, token.type === 'quoted'))) {
        problems.push({start: statement.start + token.start, end: statement.start + token.end, message: `Unknown column ${token.value} in ${table}`});
      }
    };

    tokens.forEach((token, index) => {
      // alias.column - not database.table.column and not alias.* or function of schema
      const next = tokens[index + 2];
      if (isName(token) && tokens[index + 1]?.value === '.' && isName(next) && tokens[index - 1]?.value !== '.'
        && tokens[index + 3]?.value !== '.' && tokens[index + 3]?.value !== '(') {
        const columns = sources.get(token.value.toLowerCase());
        if (columns) columnProblem(columns, next!, token.value);
      }
      // INSERT INTO table (a, b) - list of columns
      if (upper(token) === 'INTO' && isName(tokens[index + 1])) {
        const qualified = tokens[index + 2]?.value === '.';
        const nameToken = qualified ? tokens[index + 3] : tokens[index + 1];
        const open = qualified ? index + 4 : index + 2;
        const database = qualified ? tokens[index + 1].value : null;
        const table = database === null || database === schema.database ? tableOf(nameToken?.value || '', nameToken?.type === 'quoted') : undefined;
        if (!table || !table.columns.length || tokens[open]?.value !== '(' || /^(SELECT|WITH)$/.test(upper(tokens[open + 1]))) return;
        for (let position = open + 1; position < tokens.length && tokens[position].value !== ')'; position++) {
          if (isName(tokens[position])) columnProblem(table.columns, tokens[position], table.name);
        }
      }
    });
  });
  return problems;
};
