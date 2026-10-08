
export type SqlStatementType = {
  sql: string;
  /** offsets in source text, end is exclusive (delimiter not included) */
  start: number;
  end: number;
};

/**
 * Splits SQL script into statements. Delimiters inside strings, identifiers and comments are ignored,
 * DELIMITER command (procedures, triggers) changes the delimiter like in mysql client.
 */
export const splitSql = (text: string): SqlStatementType[] => {
  const statements: SqlStatementType[] = [];
  let delimiter = ';';
  let start = 0;
  let index = 0;

  const push = (end: number) => {
    const raw = text.slice(start, end);
    const sql = raw.trim();
    if (sql && !isOnlyComments(sql)) {
      const leading = raw.length - raw.trimStart().length;
      statements.push({sql, start: start + leading, end: start + leading + sql.length});
    }
  };

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];

    // DELIMITER at line start changes delimiter, the line itself is not a statement
    if ((index === 0 || text[index - 1] === '\n') && /^delimiter\s/i.test(text.slice(index, index + 10))) {
      const lineEnd = text.indexOf('\n', index) === -1 ? text.length : text.indexOf('\n', index);
      push(index);
      delimiter = text.slice(index + 9, lineEnd).trim() || ';';
      index = lineEnd;
      start = lineEnd;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      index = skipQuoted(text, index, char);
      continue;
    }
    if ((char === '-' && next === '-' && /\s/.test(text[index + 2] || ' ')) || char === '#') {
      const lineEnd = text.indexOf('\n', index);
      index = lineEnd === -1 ? text.length : lineEnd;
      continue;
    }
    if (char === '/' && next === '*') {
      const commentEnd = text.indexOf('*/', index + 2);
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
export const statementAt = (text: string, offset: number): SqlStatementType | null => {
  const statements = splitSql(text);
  if (!statements.length) return null;
  const inside = statements.find((statement) => offset >= statement.start && offset <= statement.end);
  if (inside) return inside;
  // between statements: the previous one when cursor is on its line, otherwise the next one
  const previous = [...statements].reverse().find((statement) => statement.end <= offset);
  if (previous && !text.slice(previous.end, offset).includes('\n')) return previous;
  return statements.find((statement) => statement.start >= offset) || previous || null;
};

const skipQuoted = (text: string, index: number, quote: string): number => {
  let position = index + 1;
  while (position < text.length) {
    if (text[position] === '\\' && quote !== '`') {
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

const isOnlyComments = (sql: string): boolean => {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(--\s|#).*$/gm, '').trim() === '';
};
