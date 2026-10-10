import PostgresSql from './PostgresSql';
import {
  StructureColumnInterface,
  StructureForeignKeyInterface,
  StructureIndexInterface,
  StructureTableInfoInterface,
  StructureTriggerInterface,
} from '../../Interface/Data/TableStructureInterface';

/** Pool or client - catalog can be read in transaction of dump */
export interface QueryableInterface {
  query(text: string, values?: any[]): Promise<{rows: any[]}>;
}

/** column as stored in pg_attribute */
export interface CatalogColumnInterface {
  table: string;
  name: string;
  /** short type name, e.g. varchar(50), timestamp, edit_status */
  type: string;
  nullable: boolean;
  /** default expression as stored, null without default */
  defaultExpression: string | null;
  /** literal default as value (without quotes and cast), null when default is expression or missing */
  defaultLiteral: string | null;
  /** '' - no identity, 'a' - ALWAYS, 'd' - BY DEFAULT */
  identity: '' | 'a' | 'd';
  /** expression of generated (stored) column */
  generated: string | null;
  /** serial column - default is nextval of sequence owned by the column */
  serial: boolean;
  /** sequence of serial / identity column */
  sequence: string | null;
  /** values of enum type */
  enumValues: string[] | null;
  /** enum type defined in this schema (it is dumped with tables) */
  enumType: {schema: string, name: string} | null;
  comment: string;
  /** collation other than default of type */
  collation: string | null;
  isBinary: boolean;
}

/** pg_class.relkind of objects shown as tables */
export const RELATION_KINDS = ['r', 'p', 'v', 'm', 'f'];

const REFERENCE_ACTIONS: {[code: string]: string} = {a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT'};

/** 'text'::type -> text, 12 / -1.5 / true -> as it is, other defaults are expressions */
const parseDefault = (expression: string | null): {literal: string | null, isNull: boolean} => {
  if (expression === null) {
    return {literal: null, isNull: false};
  }
  if (/^NULL(::[\w\s".\[\](),]+)?$/i.test(expression)) {
    return {literal: null, isNull: true};
  }
  const quoted = /^'((?:[^']|'')*)'(::[\w\s".\[\](),]+)?$/.exec(expression);
  if (quoted) {
    return {literal: quoted[1].replace(/''/g, "'"), isNull: false};
  }
  if (/^\(?-?\d+(\.\d+)?\)?(::[\w\s".\[\](),]+)?$/.test(expression)) {
    return {literal: expression.replace(/^\((.*)\)/, '$1').replace(/::.*$/, ''), isNull: false};
  }
  if (/^(true|false)$/i.test(expression)) {
    return {literal: expression.toLowerCase(), isNull: false};
  }
  return {literal: null, isNull: false};
};

/** "Name" -> Name for display, expressions stay as they are */
const unquoteName = (name: string): string => /^"(?:[^"]|"")+"$/.test(name) ? name.slice(1, -1).replace(/""/g, '"') : name;

/**
 * Reading of PostgreSQL catalogs (pg_class, pg_attribute, pg_constraint...) and DDL built from them.
 * "database" of other parts of application is schema here.
 * @author Mateusz Bochen
 */
class PostgresCatalog {
  constructor(private readonly db: QueryableInterface) {
  }

  /** relations (tables, views) of schema with pg_class.relkind */
  async relations(schema: string): Promise<{name: string, kind: string, oid: number}[]> {
    const {rows} = await this.db.query(
      `SELECT c.relname AS name, c.relkind AS kind, c.oid::int AS oid
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind = ANY($2) AND NOT c.relispartition
       ORDER BY c.relname`,
      [schema, RELATION_KINDS],
    );
    return rows;
  }

  /** columns of given tables (all tables of schema when null), in order of table and position */
  async columns(schema: string, tables: string[] | null): Promise<CatalogColumnInterface[]> {
    const {rows} = await this.db.query(
      `SELECT c.relname AS table_name, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
              NOT a.attnotnull AS nullable, pg_get_expr(d.adbin, d.adrelid) AS default_expression,
              a.attidentity AS identity, a.attgenerated AS generated, t.typtype, t.typname, tn.nspname AS type_schema,
              CASE WHEN t.typtype = 'e' THEN (SELECT array_agg(e.enumlabel::text ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid = t.oid) END AS enum_values,
              col_description(c.oid, a.attnum) AS comment,
              CASE WHEN a.attcollation <> t.typcollation THEN co.collname END AS collation,
              s.sequence,
              (a.attidentity = '' AND s.sequence IS NOT NULL
                AND pg_get_expr(d.adbin, d.adrelid) = format('nextval(%L::regclass)', s.sequence::regclass)) AS serial,
              a.atttypid = 'bytea'::regtype AS is_binary
       FROM pg_attribute a
       JOIN pg_class c ON c.oid = a.attrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_type t ON t.oid = a.atttypid
       JOIN pg_namespace tn ON tn.oid = t.typnamespace
       LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       LEFT JOIN pg_collation co ON co.oid = a.attcollation
       LEFT JOIN LATERAL (SELECT pg_get_serial_sequence(format('%I.%I', n.nspname, c.relname), a.attname) AS sequence) s ON TRUE
       WHERE n.nspname = $1 AND ($2::text[] IS NULL OR c.relname = ANY($2)) AND c.relkind = ANY($3)
         AND a.attnum > 0 AND NOT a.attisdropped
       ORDER BY c.relname, a.attnum`,
      [schema, tables, RELATION_KINDS],
    );
    return rows.map((row) => {
      const parsed = parseDefault(row.default_expression);
      return {
        table: row.table_name,
        name: row.name,
        type: PostgresSql.shortType(row.type),
        nullable: row.nullable,
        defaultExpression: parsed.isNull ? null : row.default_expression,
        defaultLiteral: parsed.literal,
        identity: row.identity || '',
        generated: row.generated === 's' ? row.default_expression : null,
        serial: !!row.serial,
        sequence: row.sequence,
        enumValues: row.enum_values,
        enumType: row.typtype === 'e' ? {schema: row.type_schema, name: row.typname} : null,
        comment: row.comment || '',
        collation: row.collation,
        isBinary: row.is_binary,
      };
    });
  }

  /** primary key columns of tables, in key order */
  async primaryKeys(schema: string, tables: string[] | null): Promise<{table: string, column: string}[]> {
    const {rows} = await this.db.query(
      `SELECT c.relname AS table, a.attname AS column
       FROM pg_index x
       JOIN pg_class c ON c.oid = x.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL unnest(x.indkey) WITH ORDINALITY AS k(attnum, position)
       JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
       WHERE x.indisprimary AND n.nspname = $1 AND ($2::text[] IS NULL OR c.relname = ANY($2))
       ORDER BY c.relname, k.position`,
      [schema, tables],
    );
    return rows;
  }

  /**
   * foreign keys - of table (referencing: false) or pointing to table (referencing: true).
   * table null - all foreign keys of schema.
   */
  async foreignKeys(schema: string, table: string | null, referencing: boolean = false): Promise<StructureForeignKeyInterface[]> {
    const side = referencing ? 'fn.nspname = $1 AND ($2::text IS NULL OR fc.relname = $2)' : 'n.nspname = $1 AND ($2::text IS NULL OR c.relname = $2)';
    const {rows} = await this.db.query(
      `SELECT con.conname, n.nspname AS schema, c.relname AS table, a.attname AS column,
              fn.nspname AS ref_schema, fc.relname AS ref_table, fa.attname AS ref_column,
              con.confupdtype, con.confdeltype
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_class fc ON fc.oid = con.confrelid JOIN pg_namespace fn ON fn.oid = fc.relnamespace
       CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(attnum, ref_attnum, position)
       JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
       JOIN pg_attribute fa ON fa.attrelid = con.confrelid AND fa.attnum = k.ref_attnum
       WHERE con.contype = 'f' AND ${side}
       ORDER BY n.nspname, c.relname, con.conname, k.position`,
      [schema, table],
    );
    const keys = new Map<string, StructureForeignKeyInterface>();
    rows.forEach((row) => {
      const id = `${row.schema}.${row.table}.${row.conname}`;
      if (!keys.has(id)) {
        keys.set(id, {
          name: row.conname,
          table: {databaseName: row.schema, name: row.table},
          columns: [],
          referencedTable: {databaseName: row.ref_schema, name: row.ref_table},
          referencedColumns: [],
          onUpdate: REFERENCE_ACTIONS[row.confupdtype] || row.confupdtype,
          onDelete: REFERENCE_ACTIONS[row.confdeltype] || row.confdeltype,
        });
      }
      keys.get(id)!.columns.push(row.column);
      keys.get(id)!.referencedColumns.push(row.ref_column);
    });
    return Array.from(keys.values());
  }

  async indexes(schema: string, table: string): Promise<(StructureIndexInterface & {constraint: string | null, definition: string})[]> {
    const {rows} = await this.db.query(
      `SELECT i.relname AS name, x.indisunique AS unique, x.indisprimary AS primary, am.amname AS type,
              obj_description(i.oid, 'pg_class') AS comment, con.conname AS constraint,
              pg_get_indexdef(x.indexrelid) AS definition,
              array(SELECT pg_get_indexdef(x.indexrelid, k, true) FROM generate_series(1, x.indnkeyatts) k ORDER BY k) AS columns,
              array(SELECT (x.indoption[k - 1] & 1) = 1 FROM generate_series(1, x.indnkeyatts) k ORDER BY k) AS descending
       FROM pg_index x
       JOIN pg_class i ON i.oid = x.indexrelid
       JOIN pg_class t ON t.oid = x.indrelid
       JOIN pg_namespace n ON n.oid = t.relnamespace
       JOIN pg_am am ON am.oid = i.relam
       LEFT JOIN pg_constraint con ON con.conindid = x.indexrelid AND con.conrelid = x.indrelid AND con.contype IN ('p', 'u', 'x')
       WHERE n.nspname = $1 AND t.relname = $2
       ORDER BY x.indisprimary DESC, i.relname`,
      [schema, table],
    );
    return rows.map((row) => ({
      name: row.name,
      unique: row.unique,
      primary: row.primary,
      type: String(row.type).toUpperCase(),
      columns: row.columns.map((column: string, index: number) => ({name: unquoteName(column), subPart: null, descending: !!row.descending[index]})),
      comment: row.comment || '',
      constraint: row.constraint,
      // pg_get_indexdef always qualifies the table - dump must be importable into other schema
      definition: String(row.definition).replace(
        /^(CREATE (?:UNIQUE )?INDEX (?:"(?:[^"]|"")+"|\S+) ON (?:ONLY )?)(?:"(?:[^"]|"")+"|[^\s."]+)\.(?:"(?:[^"]|"")+"|\S+)( USING )/,
        `$1${PostgresSql.identifier(table)}$2`,
      ),
    }));
  }

  async triggers(schema: string, table: string | null): Promise<(StructureTriggerInterface & {table: string, definition: string, functionOid: number})[]> {
    const {rows} = await this.db.query(
      `SELECT tg.tgname AS name, c.relname AS table, pg_get_triggerdef(tg.oid, true) AS definition, tg.tgfoid::int AS function_oid,
              CASE WHEN tg.tgtype & 2 = 2 THEN 'BEFORE' WHEN tg.tgtype & 64 = 64 THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
              concat_ws(' OR ',
                CASE WHEN tg.tgtype & 4 = 4 THEN 'INSERT' END,
                CASE WHEN tg.tgtype & 16 = 16 THEN 'UPDATE' END,
                CASE WHEN tg.tgtype & 8 = 8 THEN 'DELETE' END,
                CASE WHEN tg.tgtype & 32 = 32 THEN 'TRUNCATE' END) AS event,
              p.proname AS function_name
       FROM pg_trigger tg
       JOIN pg_class c ON c.oid = tg.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_proc p ON p.oid = tg.tgfoid
       WHERE NOT tg.tgisinternal AND n.nspname = $1 AND ($2::text IS NULL OR c.relname = $2)
       ORDER BY c.relname, tg.tgname`,
      [schema, table],
    );
    return rows.map((row) => ({
      name: row.name,
      table: row.table,
      timing: row.timing,
      event: row.event,
      statement: row.definition.replace(/^.*\bEXECUTE (FUNCTION|PROCEDURE)\s+/i, 'EXECUTE FUNCTION '),
      definition: row.definition,
      functionOid: row.function_oid,
    }));
  }

  async tableInfo(schema: string, table: string): Promise<StructureTableInfoInterface | null> {
    const {rows} = await this.db.query(
      `SELECT c.relkind, c.reltuples, obj_description(c.oid, 'pg_class') AS comment,
              CASE WHEN c.relkind IN ('r', 'p', 'm') THEN pg_relation_size(c.oid) END AS data_length,
              CASE WHEN c.relkind IN ('r', 'p', 'm') THEN pg_indexes_size(c.oid) END AS index_length,
              am.amname AS access_method
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_am am ON am.oid = c.relam
       WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = ANY($3)`,
      [schema, table, RELATION_KINDS],
    );
    if (!rows.length) {
      return null;
    }
    const row = rows[0];
    const types: {[kind: string]: string} = {r: 'BASE TABLE', p: 'PARTITIONED TABLE', v: 'VIEW', m: 'MATERIALIZED VIEW', f: 'FOREIGN TABLE'};
    return {
      type: types[row.relkind] || row.relkind,
      engine: row.access_method,
      collation: null,
      rowFormat: null,
      // -1 - table was never analysed
      rows: Number(row.reltuples) >= 0 ? Math.round(Number(row.reltuples)) : null,
      dataLength: row.data_length === null ? null : Number(row.data_length),
      indexLength: row.index_length === null ? null : Number(row.index_length),
      autoIncrement: null,
      comment: row.comment || '',
      createTime: null,
      updateTime: null,
    };
  }

  /** columns in form of structure view - key PRI / UNI / MUL as in MySQL */
  async structureColumns(schema: string, table: string): Promise<StructureColumnInterface[]> {
    const [columns, indexes] = await Promise.all([this.columns(schema, [table]), this.indexes(schema, table)]);
    const keyOf = (name: string): string => {
      if (indexes.some((index) => index.primary && index.columns.some((column) => column.name === name))) return 'PRI';
      if (indexes.some((index) => index.unique && index.columns.length === 1 && index.columns[0].name === name)) return 'UNI';
      if (indexes.some((index) => index.columns[0]?.name === name)) return 'MUL';
      return '';
    };
    return columns.map((column) => ({
      name: column.name,
      type: column.type,
      nullable: column.nullable,
      defaultValue: column.generated || column.serial ? (column.serial ? column.defaultExpression : null) : (column.defaultLiteral ?? column.defaultExpression),
      defaultIsExpression: column.defaultExpression !== null && column.defaultLiteral === null && !column.generated,
      generationExpression: column.generated,
      extra: PostgresCatalog.columnExtra(column),
      comment: column.comment,
      collation: column.collation,
      key: keyOf(column.name),
    }));
  }

  static columnExtra(column: CatalogColumnInterface): string {
    if (column.identity === 'a') return 'identity always';
    if (column.identity === 'd') return 'identity by default';
    if (column.serial) return 'serial';
    if (column.generated) return 'STORED GENERATED';
    return '';
  }

  /** column definition of CREATE TABLE */
  static columnDefinition(column: CatalogColumnInterface, useSerial: boolean): string {
    const serialTypes: {[type: string]: string} = {integer: 'serial', bigint: 'bigserial', smallint: 'smallserial'};
    const parts = [PostgresSql.identifier(column.name)];
    if (useSerial && column.serial && serialTypes[column.type]) {
      // serial creates the owned sequence itself
      parts.push(serialTypes[column.type]);
      if (!column.nullable) parts.push('NOT NULL');
      return parts.join(' ');
    }
    parts.push(column.type);
    if (column.collation) parts.push(`COLLATE ${PostgresSql.identifier(column.collation)}`);
    if (column.generated) {
      parts.push(`GENERATED ALWAYS AS (${column.generated.replace(/^\((.*)\)$/s, '$1')}) STORED`);
    } else if (column.identity) {
      parts.push(`GENERATED ${column.identity === 'a' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`);
    } else if (column.defaultExpression !== null) {
      parts.push(`DEFAULT ${column.defaultExpression}`);
    }
    if (!column.nullable) parts.push('NOT NULL');
    return parts.join(' ');
  }

  /**
   * CREATE TABLE with columns and constraints.
   * foreignKeys false - foreign keys are left out (dump adds them after data).
   * Names are not schema qualified.
   */
  async createTable(schema: string, table: string, options: {foreignKeys: boolean, serial: boolean}): Promise<string> {
    const [columns, constraints] = await Promise.all([
      this.columns(schema, [table]),
      this.constraints(schema, table),
    ]);
    const lines = [
      ...columns.map((column) => `  ${PostgresCatalog.columnDefinition(column, options.serial)}`),
      ...constraints
        .filter((constraint) => options.foreignKeys || constraint.type !== 'f')
        .map((constraint) => `  CONSTRAINT ${PostgresSql.identifier(constraint.name)} ${constraint.definition}`),
    ];
    return `CREATE TABLE ${PostgresSql.identifier(table)} (\n${lines.join(',\n')}\n)`;
  }

  /** constraints of table (primary key first, foreign keys last) - definition from pg_get_constraintdef */
  async constraints(schema: string, table: string): Promise<{name: string, type: string, definition: string}[]> {
    const {rows} = await this.db.query(
      `SELECT con.conname AS name, con.contype AS type, pg_get_constraintdef(con.oid, true) AS definition
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = $2 AND con.contype IN ('p', 'u', 'c', 'x', 'f') AND con.conislocal
       ORDER BY CASE con.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'c' THEN 2 WHEN 'x' THEN 3 ELSE 4 END, con.conname`,
      [schema, table],
    );
    return rows;
  }

  /** COMMENT ON statements of table and its columns */
  async comments(schema: string, table: string, kind: string): Promise<string[]> {
    const [info, columns] = await Promise.all([this.tableInfo(schema, table), this.columns(schema, [table])]);
    const objectType = kind === 'v' ? 'VIEW' : kind === 'm' ? 'MATERIALIZED VIEW' : kind === 'f' ? 'FOREIGN TABLE' : 'TABLE';
    const statements: string[] = [];
    if (info?.comment) {
      statements.push(`COMMENT ON ${objectType} ${PostgresSql.identifier(table)} IS ${PostgresSql.literal(info.comment)}`);
    }
    columns.filter((column) => column.comment).forEach((column) => {
      statements.push(`COMMENT ON COLUMN ${PostgresSql.identifier(table)}.${PostgresSql.identifier(column.name)} IS ${PostgresSql.literal(column.comment)}`);
    });
    return statements;
  }

  /** CREATE VIEW / MATERIALIZED VIEW */
  async createView(schema: string, view: string, kind: string): Promise<string> {
    const {rows} = await this.db.query(
      `SELECT pg_get_viewdef(c.oid, true) AS definition FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = $2`,
      [schema, view],
    );
    const definition = String(rows[0]?.definition || '').trim().replace(/;$/, '');
    return kind === 'm'
      ? `CREATE MATERIALIZED VIEW ${PostgresSql.identifier(view)} AS\n${definition}`
      : `CREATE OR REPLACE VIEW ${PostgresSql.identifier(view)} AS\n${definition}`;
  }

  /** DDL shown in structure view - table with indexes and comments, or view. Client adds semicolon after the last statement */
  async ddl(schema: string, table: string): Promise<string> {
    const [relation] = (await this.relations(schema)).filter((item) => item.name === table);
    if (!relation) {
      return '';
    }
    if (relation.kind === 'v' || relation.kind === 'm') {
      return this.createView(schema, table, relation.kind);
    }
    const [create, indexes, comments] = await Promise.all([
      this.createTable(schema, table, {foreignKeys: true, serial: false}),
      this.indexes(schema, table),
      this.comments(schema, table, relation.kind),
    ]);
    return [
      create,
      ...indexes.filter((index) => !index.constraint).map((index) => index.definition),
      ...comments,
    ].join(';\n\n');
  }

  /** enum labels of type */
  async enumValues(schema: string, type: string): Promise<string[]> {
    const {rows} = await this.db.query(
      `SELECT e.enumlabel::text AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = $1 AND t.typname = $2 ORDER BY e.enumsortorder`,
      [schema, type],
    );
    return rows.map((row) => row.label);
  }
}

export default PostgresCatalog;
