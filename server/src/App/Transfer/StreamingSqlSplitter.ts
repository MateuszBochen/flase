
/**
 * Splits SQL script into statements while it is being read (file can be bigger than memory).
 * Delimiters in strings, identifiers and comments are ignored, DELIMITER command changes the delimiter.
 * Rules are the same as in SQL console of client.
 *
 * Buffer always starts at statement boundary, so it can be scanned from its start without remembered state.
 * Only complete lines are scanned - DELIMITER lines, "--" comments and multi character delimiters are never cut.
 * @author Mateusz Bochen
 */
class StreamingSqlSplitter {
  private buffer = '';
  private delimiter = ';';

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

      if (lineStart && /^[ \t]*delimiter[ \t]/i.test(text.slice(index, Math.min(limit, index + 30)))) {
        const lineEnd = text.indexOf('\n', index);
        const end = lineEnd === -1 || lineEnd >= limit ? limit : lineEnd;
        this.pushStatement(statements, text.slice(start, index));
        this.delimiter = text.slice(index, end).trim().slice('delimiter'.length).trim() || ';';
        index = end;
        start = end;
        continue;
      }

      if (char === "'" || char === '"' || char === '`') {
        const end = StreamingSqlSplitter.skipQuoted(text, index, char, limit);
        // string continues after scanned part - wait for more data
        if (end === -1) break;
        index = end;
        lineStart = false;
        continue;
      }
      if (char === '#' || (char === '-' && next === '-' && /\s/.test(text[index + 2] ?? ' '))) {
        const lineEnd = text.indexOf('\n', index);
        index = lineEnd === -1 || lineEnd >= limit ? limit : lineEnd;
        continue;
      }
      if (char === '/' && next === '*') {
        const commentEnd = text.indexOf('*/', index + 2);
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
  private static skipQuoted(text: string, index: number, quote: string, limit: number): number {
    let position = index + 1;
    while (position < limit) {
      if (text[position] === '\\' && quote !== '`') {
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

  private pushStatement(statements: string[], raw: string): void {
    const sql = raw.trim();
    if (sql && sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(--\s|#).*$/gm, '').trim()) {
      statements.push(sql);
    }
  }
}

export default StreamingSqlSplitter;
