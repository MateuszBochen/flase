import SqlDialectType from '../Database/Driver/SqlDialectType';

export type SqlStatementType = {
  sql: string;
  /** offsets in source text, end is exclusive (delimiter not included) */
  start: number;
  end: number;
};

/**
 * Splits SQL script into statements. Delimiters inside strings, identifiers and comments are ignored.
 * MySQL: DELIMITER command (procedures, triggers) changes the delimiter like in mysql client, # comments, `names`.
 * PostgreSQL: $tag$ bodies $tag$, nested block comments, backslash escapes only in E'strings'.
 */
export const splitSql = (text: string, dialect: SqlDialectType = 'mysql'): SqlStatementType[] => {
  const mysql = dialect === 'mysql';
  const statements: SqlStatementType[] = [];
  let delimiter = ';';
  let start = 0;
  let index = 0;

  const push = (end: number) => {
    const raw = text.slice(start, end);
    const sql = raw.trim();
    if (sql && !isOnlyComments(sql, mysql)) {
      const leading = raw.length - raw.trimStart().length;
      statements.push({sql, start: start + leading, end: start + leading + sql.length});
    }
  };

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];

    // DELIMITER at line start changes delimiter, the line itself is not a statement
    if (mysql && (index === 0 || text[index - 1] === '\n') && /^delimiter\s/i.test(text.slice(index, index + 10))) {
      const lineEnd = text.indexOf('\n', index) === -1 ? text.length : text.indexOf('\n', index);
      push(index);
      delimiter = text.slice(index + 9, lineEnd).trim() || ';';
      index = lineEnd;
      start = lineEnd;
      continue;
    }

    if (char === "'" || char === '"' || (char === '`' && mysql)) {
      const backslash = mysql
        ? char !== '`'
        : char === "'" && /[eE]/.test(text[index - 1] || '') && !/[\w$]/.test(text[index - 2] || '');
      index = skipQuoted(text, index, char, backslash);
      continue;
    }
    if (!mysql && char === '$' && !/[\w$]/.test(text[index - 1] || '')) {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(index, index + 66));
      if (tag) {
        const close = text.indexOf(tag[0], index + tag[0].length);
        index = close === -1 ? text.length : close + tag[0].length;
        continue;
      }
    }
    // MySQL needs whitespace after --, PostgreSQL does not
    if ((char === '-' && next === '-' && (!mysql || /\s/.test(text[index + 2] || ' '))) || (char === '#' && mysql)) {
      const lineEnd = text.indexOf('\n', index);
      index = lineEnd === -1 ? text.length : lineEnd;
      continue;
    }
    if (char === '/' && next === '*') {
      const commentEnd = mysql ? text.indexOf('*/', index + 2) : nestedCommentEnd(text, index);
      index = commentEnd === -1 ? text.length : commentEnd + 2;
      continue;
    }
    if (text.startsWith(delimiter, index)) {
      push(index);
      index += delimiter.length;
      start = index;
      continue;
    }
    index++;
  }
  push(text.length);
  return statements;
};

/** statement under cursor - cursor after delimiter on the same line still belongs to previous statement */
export const statementAt = (text: string, offset: number, dialect: SqlDialectType = 'mysql'): SqlStatementType | null => {
  const statements = splitSql(text, dialect);
  if (!statements.length) return null;
  const inside = statements.find((statement) => offset >= statement.start && offset <= statement.end);
  if (inside) return inside;
  // between statements: the previous one when cursor is on its line, otherwise the next one
  const previous = [...statements].reverse().find((statement) => statement.end <= offset);
  if (previous && !text.slice(previous.end, offset).includes('\n')) return previous;
  return statements.find((statement) => statement.start >= offset) || previous || null;
};

/**
 * Database (MySQL) or schema (PostgreSQL) selected by statement, null when statement does not change it.
 * USE db, USE `db`, SET search_path TO "schema", other
 */
export const selectedDatabaseOf = (sql: string): string | null => {
  const use = /^\s*use\s+(`([^`]+)`|"([^"]+)"|([^`";\s]+))/i.exec(sql);
  if (use) {
    return use[2] ?? use[3] ?? use[4];
  }
  const searchPath = /^\s*set\s+(?:session\s+|local\s+)?search_path\s*(?:to|=)\s*("((?:[^"]|"")+)"|'([^']+)'|([^\s,;]+))/i.exec(sql);
  if (searchPath) {
    return searchPath[2]?.replace(/""/g, '"') ?? searchPath[3] ?? searchPath[4].toLowerCase();
  }
  return null;
};

const skipQuoted = (text: string, index: number, quote: string, backslash: boolean): number => {
  let position = index + 1;
  while (position < text.length) {
    if (backslash && text[position] === '\\') {
      position += 2;
      continue;
    }
    if (text[position] === quote) {
      // doubled quote is escaped quote
      if (text[position + 1] === quote) {
        position += 2;
        continue;
      }
      return position + 1;
    }
    position++;
  }
  return text.length;
};

/** PostgreSQL block comments can be nested - index of closing star of the outer one, -1 when not closed */
const nestedCommentEnd = (text: string, index: number): number => {
  let depth = 0;
  let position = index;
  while (position < text.length - 1) {
    if (text[position] === '/' && text[position + 1] === '*') {
      depth++;
      position += 2;
    } else if (text[position] === '*' && text[position + 1] === '/') {
      depth--;
      if (depth === 0) return position;
      position += 2;
    } else {
      position++;
    }
  }
  return -1;
};

const isOnlyComments = (sql: string, mysql: boolean): boolean => {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(mysql ? /(--\s|#).*$/gm : /--.*$/gm, '').trim() === '';
};
