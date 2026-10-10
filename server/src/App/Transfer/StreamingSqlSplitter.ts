
import SqlDialectType from '../Driver/Query/SqlDialectType';

/**
 * Splits SQL script into statements while it is being read (file can be bigger than memory).
 * Delimiters in strings, identifiers and comments are ignored.
 * MySQL: DELIMITER command changes the delimiter, # comments, `identifiers`, backslash escapes in strings.
 * PostgreSQL: $tag$ bodies $tag$, nested block comments, backslash escapes only in E'strings'.
 * Rules are the same as in SQL console of client.
 *
 * Buffer always starts at statement boundary, so it can be scanned from its start without remembered state.
 * Only complete lines are scanned - DELIMITER lines, "--" comments and multi character delimiters are never cut.
 * @author Mateusz Bochen
 */
class StreamingSqlSplitter {
  private buffer = '';
  private delimiter = ';';
  private readonly mysql: boolean;

  constructor(dialect: SqlDialectType = 'mysql') {
    this.mysql = dialect === 'mysql';
  }

  /** returns statements completed by the chunk */
  push(chunk: string): string[] {
    this.buffer += chunk;
    return this.scan(false);
  }

  /** rest of the script after the last chunk */
  end(): string[] {
    return this.scan(true);
  }

  private scan(final: boolean): string[] {
    const statements: string[] = [];
    const text = this.buffer;
    const limit = final ? text.length : text.lastIndexOf('\n') + 1;
    let start = 0;
    let index = 0;
    let lineStart = true;

    while (index < limit) {
      const char = text[index];
      const next = text[index + 1];

      if (this.mysql && lineStart && /^[ \t]*delimiter[ \t]/i.test(text.slice(index, Math.min(limit, index + 30)))) {
        const lineEnd = text.indexOf('\n', index);
        const end = lineEnd === -1 || lineEnd >= limit ? limit : lineEnd;
        this.pushStatement(statements, text.slice(start, index));
        this.delimiter = text.slice(index, end).trim().slice('delimiter'.length).trim() || ';';
        index = end;
        start = end;
        continue;
      }

      if (char === "'" || char === '"' || (char === '`' && this.mysql)) {
        // PostgreSQL: backslash escapes only in E'...' strings
        const backslash = this.mysql
          ? char !== '`'
          : char === "'" && /[eE]/.test(text[index - 1] ?? '') && !/[\w$]/.test(text[index - 2] ?? '');
        const end = StreamingSqlSplitter.skipQuoted(text, index, char, limit, backslash);
        // string continues after scanned part - wait for more data
        if (end === -1) break;
        index = end;
        lineStart = false;
        continue;
      }
      if (!this.mysql && char === '$' && !/[\w$]/.test(text[index - 1] ?? '')) {
        const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(index, index + 66));
        if (tag) {
          const close = text.indexOf(tag[0], index + tag[0].length);
          if (close === -1 || close + tag[0].length > limit) {
            // body continues after scanned part - wait for more data
            if (!final) break;
            index = limit;
            continue;
          }
          index = close + tag[0].length;
          lineStart = false;
          continue;
        }
      }
      // MySQL needs whitespace after --, PostgreSQL does not
      if ((char === '#' && this.mysql) || (char === '-' && next === '-' && (!this.mysql || /\s/.test(text[index + 2] ?? ' ')))) {
        const lineEnd = text.indexOf('\n', index);
        index = lineEnd === -1 || lineEnd >= limit ? limit : lineEnd;
        continue;
      }
      if (char === '/' && next === '*') {
        const commentEnd = this.mysql ? text.indexOf('*/', index + 2) : StreamingSqlSplitter.nestedCommentEnd(text, index);
        if (commentEnd === -1 || commentEnd + 2 > limit) {
          if (!final) break;
          index = limit;
          continue;
        }
        index = commentEnd + 2;
        lineStart = false;
        continue;
      }
      if (text.startsWith(this.delimiter, index)) {
        this.pushStatement(statements, text.slice(start, index));
        index += this.delimiter.length;
        start = index;
        lineStart = false;
        continue;
      }

      lineStart = char === '\n' || (lineStart && (char === ' ' || char === '\t' || char === '\r'));
      index++;
    }

    if (final) {
      this.pushStatement(statements, text.slice(start));
      this.buffer = '';
    } else {
      // only the unfinished statement stays in memory
      this.buffer = text.slice(start);
    }
    return statements;
  }

  /** index after closing quote, -1 when the string is not closed in scanned part */
  private static skipQuoted(text: string, index: number, quote: string, limit: number, backslash: boolean): number {
    let position = index + 1;
    while (position < limit) {
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
    return -1;
  }

  /** PostgreSQL block comments can be nested - index of closing star of the outer one, -1 when not closed */
  private static nestedCommentEnd(text: string, index: number): number {
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
  }

  private pushStatement(statements: string[], raw: string): void {
    const sql = raw.trim();
    if (sql && sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(this.mysql ? /(--\s|#).*$/gm : /--.*$/gm, '').trim()) {
      statements.push(sql);
    }
  }
}

export default StreamingSqlSplitter;
