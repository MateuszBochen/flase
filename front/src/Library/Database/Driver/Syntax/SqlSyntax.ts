import SqlDialectType from '../SqlDialectType';

/**
 * Lexical rules of SQL of a database family - strings, names, comments and statement delimiters.
 * Tokenizer, splitter and inspections of SQL ask these rules instead of checking the dialect.
 * Pure module (no imports of application) - the same rules are in server (StreamingSqlSplitter, SqlText).
 */
export interface SqlSyntaxInterface {
  /** characters starting a string - MySQL also "text" (without ANSI_QUOTES) */
  readonly stringQuotes: string[];
  /** characters quoting names - MySQL `name`, PostgreSQL "name" */
  readonly identifierQuotes: string[];
  /** backslash escapes in every string (MySQL) or only in E'...' strings (PostgreSQL) */
  readonly backslashEscapes: 'all' | 'escape-strings';
  /** # starts comment to end of line */
  readonly hashComments: boolean;
  /** -- starts comment only when followed by whitespace (MySQL: 1--1 is subtraction) */
  readonly dashCommentNeedsSpace: boolean;
  /** block comments can be nested */
  readonly nestedBlockComments: boolean;
  /** /*! ... *\/ and /*M! ... *\/ are executed - they are statements, not comments */
  readonly executableComments: boolean;
  /** $tag$ ... $tag$ strings (function bodies) */
  readonly dollarQuotes: boolean;
  /** DELIMITER command of client changes the delimiter of statements (procedures, triggers) */
  readonly delimiterCommand: boolean;
  /** names of tables are compared without letter case also when quoted */
  readonly caseInsensitiveNames: boolean;
  /** built-in table which needs no definition - dual, pg_catalog tables */
  isSystemTable(name: string): boolean;
}

export const MYSQL_SYNTAX: SqlSyntaxInterface = {
  stringQuotes: ["'", '"'],
  identifierQuotes: ['`'],
  backslashEscapes: 'all',
  hashComments: true,
  dashCommentNeedsSpace: true,
  nestedBlockComments: false,
  executableComments: true,
  dollarQuotes: false,
  delimiterCommand: true,
  caseInsensitiveNames: true,
  isSystemTable: (name) => /^dual$/i.test(name),
};

export const POSTGRES_SYNTAX: SqlSyntaxInterface = {
  stringQuotes: ["'"],
  identifierQuotes: ['"'],
  backslashEscapes: 'escape-strings',
  hashComments: false,
  dashCommentNeedsSpace: false,
  nestedBlockComments: true,
  executableComments: false,
  dollarQuotes: true,
  delimiterCommand: false,
  caseInsensitiveNames: false,
  isSystemTable: (name) => /^pg_/i.test(name),
};

const SYNTAX: {[dialect in SqlDialectType]: SqlSyntaxInterface} = {
  mysql: MYSQL_SYNTAX,
  postgresql: POSTGRES_SYNTAX,
};

/** rules of the dialect - drivers expose them as driver.syntax */
// other than mysql is PostgreSQL family - as before the rules were moved here (e.g. 'postgres' of older callers)
export const syntaxOf = (dialect: SqlDialectType = 'mysql'): SqlSyntaxInterface => SYNTAX[dialect] ?? POSTGRES_SYNTAX;

/** -- or # comment starts at index */
export const lineCommentAt = (text: string, index: number, syntax: SqlSyntaxInterface): boolean => {
  const char = text[index];
  if (char === '#') return syntax.hashComments;
  return char === '-' && text[index + 1] === '-' && (!syntax.dashCommentNeedsSpace || /\s/.test(text[index + 2] || ' '));
};

/** index of star of closing star-slash of block comment starting at index, -1 when it is not closed */
export const blockCommentEnd = (text: string, index: number, syntax: SqlSyntaxInterface): number => {
  if (!syntax.nestedBlockComments) return text.indexOf('*/', index + 2);
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

/** backslash escapes characters in string starting with quote at index (E'...' of PostgreSQL) */
export const backslashInString = (text: string, index: number, syntax: SqlSyntaxInterface): boolean => syntax.backslashEscapes === 'all'
  ? syntax.stringQuotes.includes(text[index])
  : text[index] === "'" && /[eE]/.test(text[index - 1] || '') && !/[\w$]/.test(text[index - 2] || '');

/** $tag$ opening dollar quoted string at index, null when there is none */
export const dollarTagAt = (text: string, index: number, syntax: SqlSyntaxInterface): string | null => {
  if (!syntax.dollarQuotes || text[index] !== '$' || /[\w$]/.test(text[index - 1] || '')) return null;
  const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(index, index + 66));
  return tag ? tag[0] : null;
};

/** index after the closing quote, text length when it is not closed; doubled quote is escaped quote */
export const skipQuoted = (text: string, index: number, quote: string, backslash: boolean): number => {
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

/** statement has only comments - executable comments of MySQL are statements */
export const isOnlyComments = (sql: string, syntax: SqlSyntaxInterface): boolean => sql
  .replace(syntax.executableComments ? /\/\*(?!!|M!)[\s\S]*?\*\//g : /\/\*[\s\S]*?\*\//g, '')
  .replace(syntax.hashComments ? /(--\s|#).*$/gm : syntax.dashCommentNeedsSpace ? /--\s.*$/gm : /--.*$/gm, '')
  .trim() === '';

/** DELIMITER command at index (line start) */
export const delimiterCommandAt = (text: string, index: number, syntax: SqlSyntaxInterface): boolean => syntax.delimiterCommand
  && (index === 0 || text[index - 1] === '\n') && /^delimiter\s/i.test(text.slice(index, index + 10));
