"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
    constructor() {
        this.buffer = '';
        this.delimiter = ';';
    }
    /** returns statements completed by the chunk */
    push(chunk) {
        this.buffer += chunk;
        return this.scan(false);
    }
    /** rest of the script after the last chunk */
    end() {
        return this.scan(true);
    }
    scan(final) {
        var _a;
        const statements = [];
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
                if (end === -1)
                    break;
                index = end;
                lineStart = false;
                continue;
            }
            if (char === '#' || (char === '-' && next === '-' && /\s/.test((_a = text[index + 2]) !== null && _a !== void 0 ? _a : ' '))) {
                const lineEnd = text.indexOf('\n', index);
                index = lineEnd === -1 || lineEnd >= limit ? limit : lineEnd;
                continue;
            }
            if (char === '/' && next === '*') {
                const commentEnd = text.indexOf('*/', index + 2);
                if (commentEnd === -1 || commentEnd + 2 > limit) {
                    if (!final)
                        break;
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
        }
        else {
            // only the unfinished statement stays in memory
            this.buffer = text.slice(start);
        }
        return statements;
    }
    /** index after closing quote, -1 when the string is not closed in scanned part */
    static skipQuoted(text, index, quote, limit) {
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
    pushStatement(statements, raw) {
        const sql = raw.trim();
        if (sql && sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(--\s|#).*$/gm, '').trim()) {
            statements.push(sql);
        }
    }
}
exports.default = StreamingSqlSplitter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RyZWFtaW5nU3FsU3BsaXR0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQXBwL1RyYW5zZmVyL1N0cmVhbWluZ1NxbFNwbGl0dGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQ0E7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFNLG9CQUFvQjtJQUExQjtRQUNVLFdBQU0sR0FBRyxFQUFFLENBQUM7UUFDWixjQUFTLEdBQUcsR0FBRyxDQUFDO0lBMkcxQixDQUFDO0lBekdDLGdEQUFnRDtJQUNoRCxJQUFJLENBQUMsS0FBYTtRQUNoQixJQUFJLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQztRQUNyQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDMUIsQ0FBQztJQUVELDhDQUE4QztJQUM5QyxHQUFHO1FBQ0QsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3pCLENBQUM7SUFFTyxJQUFJLENBQUMsS0FBYzs7UUFDekIsTUFBTSxVQUFVLEdBQWEsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDekIsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMvRCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxJQUFJLFNBQVMsR0FBRyxJQUFJLENBQUM7UUFFckIsT0FBTyxLQUFLLEdBQUcsS0FBSyxFQUFFO1lBQ3BCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUN6QixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO1lBRTdCLElB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