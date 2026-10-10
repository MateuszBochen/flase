const {types: pgTypes} = require('pg');

/**
 * Quoting of names and values for PostgreSQL, type parsers of results.
 * @author Mateusz Bochen
 */
class PostgresSql {
  static identifier(name: string): string {
    return `"${String(name).replace(/"/g, '""')}"`;
  }

  /** "schema"."table" */
  static table(schema: string, name: string): string {
    return `${PostgresSql.identifier(schema)}.${PostgresSql.identifier(name)}`;
  }

  /** string literal, correct with any standard_conforming_strings */
  static literal(value: any): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
    if (typeof value === 'boolean') {
      return value ? 'TRUE' : 'FALSE';
    }
    if (Buffer.isBuffer(value)) {
      return `'\\x${value.toString('hex')}'::bytea`;
    }
    const text = String(value);
    const quoted = `'${text.replace(/'/g, "''")}'`;
    return text.includes('\\') ? `E${quoted.replace(/\\/g, '\\\\')}` : quoted;
  }

  /** "a", "b" */
  static identifiers(names: string[]): string {
    return names.map((name) => PostgresSql.identifier(name)).join(', ');
  }

  /** shorter names of types as used in DDL - character varying(50) -> varchar(50) */
  static shortType(type: string): string {
    return type
      .replace(/^character varying/, 'varchar')
      .replace(/^character\b/, 'char')
      .replace(/^timestamp(\(\d+\))? without time zone/, 'timestamp$1')
      .replace(/^timestamp(\(\d+\))? with time zone/, 'timestamptz$1')
      .replace(/^time(\(\d+\))? without time zone/, 'time$1')
      .replace(/^time(\(\d+\))? with time zone/, 'timetz$1')
      .replace(/^bit varying/, 'varbit');
  }

  /**
   * Values stay as they are in database (dates without timezone shift, json as text, numbers without rounding).
   * bytea is Buffer (sent as binary value), small integers are numbers, booleans true / false.
   */
  static readonly types = {
    getTypeParser: (oid: number, format: string = 'text'): ((value: string) => any) => {
      switch (oid) {
        case 17:
          return pgTypes.getTypeParser(17, format);
        case 21: case 23: case 26:
          return (value: string) => Number(value);
        case 16:
          return (value: string) => value === 't' ? 'true' : 'false';
        default:
          return (value: string) => value;
      }
    },
  };
}

export default PostgresSql;
