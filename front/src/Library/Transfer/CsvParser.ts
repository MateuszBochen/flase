
/**
 * CSV parser for streams: quoted fields, doubled quotes, new lines in quotes, \n and \r\n.
 * Rows are returned when they are complete.
 * @author Mateusz Bochen
 */
class CsvParser {
  private field = '';
  private row: string[] = [];
  /** field was quoted - empty quoted field is empty string, not NULL */
  private quotedField = false;
  private inQuotes = false;
  private quotePending = false;
  private rowHasData = false;

  constructor(private readonly delimiter: string = ',') {
  }

  /** rows completed by the chunk, every field knows whether it was quoted */
  push(chunk: string): {values: string[], quoted: boolean[]}[] {
    const rows: {values: string[], quoted: boolean[]}[] = [];
    let quoted: boolean[] = [];

    const endField = () => {
      this.row.push(this.field);
      quoted.push(this.quotedField);
      this.field = '';
      this.quotedField = false;
    };
    const endRow = () => {
      endField();
      if (this.rowHasData || this.row.length > 1 || this.row[0] !== '') {
        rows.push({values: this.row, quoted});
      }
      this.row = [];
      quoted = [];
      this.rowHasData = false;
    };

    // fields quoted state of current row is kept between chunks
    quoted = (this as any).pendingQuoted || [];

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
        } else {
          this.field += char;
        }
        continue;
      }

      if (char === '"' && this.field === '') {
        this.inQuotes = true;
        this.quotedField = true;
        this.rowHasData = true;
      } else if (char === this.delimiter) {
        endField();
        this.rowHasData = true;
      } else if (char === '\n') {
        endRow();
      } else if (char === '\r') {
        // \r\n - new line comes next
      } else {
        this.field += char;
        this.rowHasData = true;
      }
    }

    (this as any).pendingQuoted = quoted;
    return rows;
  }

  /** last row without new line at the end */
  end(): {values: string[], quoted: boolean[]}[] {
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

export default CsvParser;
