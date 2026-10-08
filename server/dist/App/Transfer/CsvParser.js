"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * CSV parser for streams: quoted fields, doubled quotes, new lines in quotes, \n and \r\n.
 * Rows are returned when they are complete.
 * @author Mateusz Bochen
 */
class CsvParser {
    constructor(delimiter = ',') {
        this.delimiter = delimiter;
        this.field = '';
        this.row = [];
        /** field was quoted - empty quoted field is empty string, not NULL */
        this.quotedField = false;
        this.inQuotes = false;
        this.quotePending = false;
        this.rowHasData = false;
    }
    /** rows completed by the chunk, every field knows whether it was quoted */
    push(chunk) {
        const rows = [];
        let quoted = [];
        const endField = () => {
            this.row.push(this.field);
            quoted.push(this.quotedField);
            this.field = '';
            this.quotedField = false;
        };
        const endRow = () => {
            endField();
            if (this.rowHasData || this.row.length > 1 || this.row[0] !== '') {
                rows.push({ values: this.row, quoted });
            }
            this.row = [];
            quoted = [];
            this.rowHasData = false;
        };
        // fields quoted state of current row is kept between chunks
        quoted = this.pendingQuoted || [];
        for (let index = 0; index < chunk.length; index++) {
            const char = chunk[index];
            if (this.quotePending) {
                this.quotePending = false;
                if (char === '"') {
                    this.field += '"';
                    continue;
                }
                this.inQuotes = false;
            }
            if (this.inQuotes) {
                if (char === '"') {
                    this.quotePending = true;
                }
                else {
                    this.field += char;
                }
                continue;
            }
            if (char === '"' && this.field === '') {
                this.inQuotes = true;
                this.quotedField = true;
                this.rowHasData = true;
            }
            else if (char === this.delimiter) {
                endField();
                this.rowHasData = true;
            }
            else if (char === '\n') {
                endRow();
            }
            else if (char === '\r') {
                // \r\n - new line comes next
            }
            else {
                this.field += char;
                this.rowHasData = true;
            }
        }
        this.pendingQuoted = quoted;
        return rows;
    }
    /** last row without new line at the end */
    end() {
        if (this.quotePending) {
            this.quotePending = false;
            this.inQuotes = false;
        }
        if (this.field === '' && this.row.length === 0 && !this.rowHasData) {
            return [];
        }
        return this.push('\n');
    }
}
exports.default = CsvParser;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiQ3N2UGFyc2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vc3JjL0FwcC9UcmFuc2Zlci9Dc3ZQYXJzZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFDQTs7OztHQUlHO0FBQ0gsTUFBTSxTQUFTO0lBU2IsWUFBNkIsWUFBb0IsR0FBRztRQUF2QixjQUFTLEdBQVQsU0FBUyxDQUFjO1FBUjVDLFVBQUssR0FBRyxFQUFFLENBQUM7UUFDWCxRQUFHLEdBQWEsRUFBRSxDQUFDO1FBQzNCLHNFQUFzRTtRQUM5RCxnQkFBVyxHQUFHLEtBQUssQ0FBQztRQUNwQixhQUFRLEdBQUcsS0FBSyxDQUFDO1FBQ2pCLGlCQUFZLEdBQUcsS0FBSyxDQUFDO1FBQ3JCLGVBQVUsR0FBRyxLQUFLLENBQUM7SUFHM0IsQ0FBQztJQUVELDJFQUEyRTtJQUMzRSxJQUFJLENBQUMsS0FBYTtRQUNoQixNQUFNLElBQUksR0FBNEMsRUFBRSxDQUFDO1FBQ3pELElBQUksTUFBTSxHQUFjLEVBQUUsQ0FBQztRQUUzQixNQUFNLFFBQVEsR0FBRyxHQUFHLEVBQUU7WUFDcEIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1lBQzFCLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLFdBQVcsQ0FBQyxDQUFDO1lBQzlCLElBQUksQ0FBQyxLQUFLLEdBQUcsRUFBRSxDQUFDO1lBQ2hCLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1FBQzNCLENBQUMsQ0FBQztRQUNGLE1BQU0sTUFBTSxHQUFHLEdBQUcsRUFBRTtZQUNsQixRQUFRLEVBQUUsQ0FBQztZQUNYLElBQUksSUFBSSxDQUFDLFVBQVUsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUU7Z0JBQ2hFLElBQUksQ0FBQyxJQUFJ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