import SqlDialectType from '../Database/Driver/SqlDialectType';

export type SqlTokenType = {
  /** word: keyword or name, quoted: `name` / "name", param: :name */
  type: 'word' | 'quoted' | 'string' | 'number' | 'param' | 'symbol';
  /** word as written, quoted name without quotes, param without colon */
  value: string;
  /** offsets in text, end is exclusive */
  start: number;
  end: number;
};

/**
 * Tokens of SQL without whitespace and comments - the same rules of strings and comments as splitSql.
 * MySQL: `names`, # comments, backslash escapes. PostgreSQL: "names", $tag$ bodies $tag$ (one string), E'strings', nested block comments.
 */
export const tokenizeSql = (text: string, dialect: SqlDialectType = 'mysql'): SqlTokenType[] => {
  const mysql = dialect === 'mysql';
  const tokens: SqlTokenType[] = [];
  let index = 0;
  const push = (type: SqlTokenType['type'], start: number, end: number, value: string = text.slice(start, end)) => {
    tokens.push({type, value, start, end});
    index = end;
  };

  while (index < text.length) {
    const char = text[index];
    const next = text[index + 1];
    if (/\s/.test(char)) {
      index++;
      continue;
    }
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
    if (char === "'" || (char === '"' && mysql)) {
      const backslash = mysql || (/[eE]/.test(text[index - 1] || '') && !/[\w$]/.test(text[index - 2] || ''));
      // E'...' - the E is part of the string
      const start = tokens.length && tokens[tokens.length - 1].end === index && /^[eE]$/.test(tokens[tokens.length - 1].value) && !mysql
        ? tokens.pop()!.start
        : index;
      const end = skipQuoted(text, index, char, backslash);
      push('string', start, end);
      continue;
    }
    if (char === '`' || char === '"') {
      const end = skipQuoted(text, index, char, false);
      const closed = text[end - 1] === char && end - 1 > index;
      push('quoted', index, end, text.slice(index + 1, closed ? end - 1 : end).split(char + char).join(char));
      continue;
    }
    if (!mysql && char === '$' && !/[\w$]/.test(text[index - 1] || '')) {
      const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(index, index + 66));
      if (tag) {
        const close = text.indexOf(tag[0], index + tag[0].length);
        push('string', index, close === -1 ? text.length : close + tag[0].length);
        continue;
      }
    }
    // :name - not :: (PostgreSQL cast) and not := (assignment)
    if (char === ':' && /[A-Za-z_]/.test(next || '') && text[index - 1] !== ':') {
      const name = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(index + 1))![0];
      push('param', index, index + 1 + name.length, name);
      continue;
    }
    const number = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(text.slice(index, index + 100));
    if (number && !/[\w$]/.test(text[index - 1] || '')) {
      push('number', index, index + number[0].length);
      continue;
    }
    const word = /^[A-Za-z_\u0080-￿][\w$\u0080-￿]*/.exec(text.slice(index, index + 200));
    if (word) {
      push('word', index, index + word[0].length);
      continue;
    }
    const symbol = /^(::|:=|<>|<=|>=|!=|\|\||->>|->)/.exec(text.slice(index, index + 3));
    push('symbol', index, index + (symbol ? symbol[0].length : 1));
  }
  return tokens;
};

const skipQuoted = (text: string, index: number, quote: string, backslash: boolean): number => {
  let position = index + 1;
  while (position < text.length) {
    if (backslash && text[position] === '\\') {
      position += 2;
      continue;
    }
    if (text[position] === quote) {
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
