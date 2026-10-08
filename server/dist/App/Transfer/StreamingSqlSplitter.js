"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
    constructor(dialect = 'mysql') {
        this.buffer = '';
        this.delimiter = ';';
        this.mysql = dialect === 'mysql';
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
        var _a, _b, _c, _d;
        const statements = [];
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
                    : char === "'" && /[eE]/.test((_a = text[index - 1]) !== null && _a !== void 0 ? _a : '') && !/[\w$]/.test((_b = text[index - 2]) !== null && _b !== void 0 ? _b : '');
                const end = StreamingSqlSplitter.skipQuoted(text, index, char, limit, backslash);
                // string continues after scanned part - wait for more data
                if (end === -1)
                    break;
                index = end;
                lineStart = false;
                continue;
            }
            if (!this.mysql && char === '$' && !/[\w$]/.test((_c = text[index - 1]) !== null && _c !== void 0 ? _c : '')) {
                const tag = /^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/.exec(text.slice(index, index + 66));
                if (tag) {
                    const close = text.indexOf(tag[0], index + tag[0].length);
                    if (close === -1 || close + tag[0].length > limit) {
                        // body continues after scanned part - wait for more data
                        if (!final)
                            break;
                        index = limit;
                        continue;
                    }
                    index = close + tag[0].length;
                    lineStart = false;
                    continue;
                }
            }
            // MySQL needs whitespace after --, PostgreSQL does not
            if ((char === '#' && this.mysql) || (char === '-' && next === '-' && (!this.mysql || /\s/.test((_d = text[index + 2]) !== null && _d !== void 0 ? _d : ' ')))) {
                const lineEnd = text.indexOf('\n', index);
                index = lineEnd === -1 || lineEnd >= limit ? limit : lineEnd;
                continue;
            }
            if (char === '/' && next === '*') {
                const commentEnd = this.mysql ? text.indexOf('*/', index + 2) : StreamingSqlSplitter.nestedCommentEnd(text, index);
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
    static skipQuoted(text, index, quote, limit, backslash) {
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
    static nestedCommentEnd(text, index) {
        let depth = 0;
        let position = index;
        while (position < text.length - 1) {
            if (text[position] === '/' && text[position + 1] === '*') {
                depth++;
                position += 2;
            }
            else if (text[position] === '*' && text[position + 1] === '/') {
                depth--;
                if (depth === 0)
                    return position;
                position += 2;
            }
            else {
                position++;
            }
        }
        return -1;
    }
    pushStatement(statements, raw) {
        const sql = raw.trim();
        if (sql && sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(this.mysql ? /(--\s|#).*$/gm : /--.*$/gm, '').trim()) {
            statements.push(sql);
        }
    }
}
exports.default = StreamingSqlSplitter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiU3RyZWFtaW5nU3FsU3BsaXR0ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvQXBwL1RyYW5zZmVyL1N0cmVhbWluZ1NxbFNwbGl0dGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBR0E7Ozs7Ozs7Ozs7R0FVRztBQUNILE1BQU0sb0JBQW9CO0lBS3hCLFlBQVksVUFBMEIsT0FBTztRQUpyQyxXQUFNLEdBQUcsRUFBRSxDQUFDO1FBQ1osY0FBUyxHQUFHLEdBQUcsQ0FBQztRQUl0QixJQUFJLENBQUMsS0FBSyxHQUFHLE9BQU8sS0FBSyxPQUFPLENBQUM7SUFDbkMsQ0FBQztJQUVELGdEQUFnRDtJQUNoRCxJQUFJLENBQUMsS0FBYTtRQUNoQixJQUFJLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQztRQUNyQixPQUFPLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDMUIsQ0FBQztJQUVELDhDQUE4QztJQUM5QyxHQUFHO1FBQ0QsT0FBTyxJQUFJLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3pCLENBQUM7SUFFTyxJQUFJLENBQUMsS0FBYzs7UUFDekIsTUFBTSxVQUFVLEdBQWEsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7UUFDekIsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUMvRCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7UUFDZCxJQUFJLFNBQVMsR0FBRyxJQUFJLENBQUM7UUFFckIsT0FBTyxLQUFLLEdBQUcsS0FBSyxFQUFFO1lBQ3BCLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztZ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