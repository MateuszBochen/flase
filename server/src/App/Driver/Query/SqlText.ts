import SqlDialectType from './SqlDialectType';

/**
 * Checks of SQL written by user (SELECT of view, CREATE of routine) before it is used in built statements.
 * @author Mateusz Bochen
 */
class SqlText {
  /** strings, quoted names and comments replaced by spaces - rest can be searched for ; and keywords */
  static code(sql: string, dialect: SqlDialectType): string {
    const blank = (text: string) => text.replace(/[^\n]/g, ' ');
    let result = sql
      .replace(/\/\*[\s\S]*?\*\//g, blank)
      .replace(dialect === 'mysql' ? /(--\s|#)[^\n]*/g : /--[^\n]*/g, blank);
    if (dialect === 'postgresql') {
      // $$ body $$, $tag$ body $tag$
      result = result.replace(/\$([A-Za-z_]\w*)?\$[\s\S]*?\$\1\$/g, blank);
    }
    const quotes = dialect === 'mysql' ? /'(?:[^'\\]|''|\\.)*'|"(?:[^"\\]|""|\\.)*"|`(?:[^`]|``)*`/g : /'(?:[^']|'')*'|"(?:[^"]|"")*"/g;
    return result.replace(quotes, blank);
  }

  /** text without leading comments and trailing semicolons */
  static trim(sql: string): string {
    let text = String(sql || '').trim();
    for (;;) {
      const next = text.replace(/^(\/\*[\s\S]*?\*\/|--[^\n]*(\n|$)|#[^\n]*(\n|$))\s*/, '');
      if (next === text) break;
      text = next;
    }
    return text.replace(/[\s;]+$/, '');
  }

  /** one statement - SELECT of view must not end the statement and start other one */
  static singleStatement(sql: string, dialect: SqlDialectType, label: string): string {
    const text = SqlText.trim(sql);
    if (!text) {
      throw new Error(`${label} is required`);
    }
    if (SqlText.code(text, dialect).includes(';')) {
      throw new Error(`${label} must be one statement`);
    }
    return text;
  }

  /** CREATE statement of routine / trigger / event / view */
  static createStatement(sql: string, dialect: SqlDialectType): string {
    const text = SqlText.trim(sql);
    if (dialect === 'mysql' && /^\s*DELIMITER\b/im.test(SqlText.code(text, dialect))) {
      throw new Error('DELIMITER is a command of mysql client - write the CREATE statement without it');
    }
    if (!/^CREATE\b/i.test(text)) {
      throw new Error('Statement must start with CREATE');
    }
    return text;
  }
}

export default SqlText;
