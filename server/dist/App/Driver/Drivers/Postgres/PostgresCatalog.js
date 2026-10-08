"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RELATION_KINDS = void 0;
const PostgresSql_1 = __importDefault(require("./PostgresSql"));
/** pg_class.relkind of objects shown as tables */
exports.RELATION_KINDS = ['r', 'p', 'v', 'm', 'f'];
const REFERENCE_ACTIONS = { a: 'NO ACTION', r: 'RESTRICT', c: 'CASCADE', n: 'SET NULL', d: 'SET DEFAULT' };
/** 'text'::type -> text, 12 / -1.5 / true -> as it is, other defaults are expressions */
const parseDefault = (expression) => {
    if (expression === null) {
        return { literal: null, isNull: false };
    }
    if (/^NULL(::[\w\s".\[\](),]+)?$/i.test(expression)) {
        return { literal: null, isNull: true };
    }
    const quoted = /^'((?:[^']|'')*)'(::[\w\s".\[\](),]+)?$/.exec(expression);
    if (quoted) {
        return { literal: quoted[1].replace(/''/g, "'"), isNull: false };
    }
    if (/^\(?-?\d+(\.\d+)?\)?(::[\w\s".\[\](),]+)?$/.test(expression)) {
        return { literal: expression.replace(/^\((.*)\)/, '$1').replace(/::.*$/, ''), isNull: false };
    }
    if (/^(true|false)$/i.test(expression)) {
        return { literal: expression.toLowerCase(), isNull: false };
    }
    return { literal: null, isNull: false };
};
/** "Name" -> Name for display, expressions stay as they are */
const unquoteName = (name) => /^"(?:[^"]|"")+"$/.test(name) ? name.slice(1, -1).replace(/""/g, '"') : name;
/**
 * Reading of PostgreSQL catalogs (pg_class, pg_attribute, pg_constraint...) and DDL built from them.
 * "database" of other parts of application is schema here.
 * @author Mateusz Bochen
 */
class PostgresCatalog {
    constructor(db) {
        this.db = db;
    }
    /** relations (tables, views) of schema with pg_class.relkind */
    async relations(schema) {
        const { rows } = await this.db.query(`SELECT c.relname AS name, c.relkind AS kind, c.oid::int AS oid
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind = ANY($2) AND NOT c.relispartition
       ORDER BY c.relname`, [schema, exports.RELATION_KINDS]);
        return rows;
    }
    /** columns of given tables (all tables of schema when null), in order of table and position */
    async columns(schema, tables) {
        const { rows } = await this.db.query(`SELECT c.relname AS table_name, a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type,
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
       ORDER BY c.relname, a.attnum`, [schema, tables, exports.RELATION_KINDS]);
        return rows.map((row) => {
            const parsed = parseDefault(row.default_expression);
            return {
                table: row.table_name,
                name: row.name,
                type: PostgresSql_1.default.shortType(row.type),
                nullable: row.nullable,
                defaultExpression: parsed.isNull ? null : row.default_expression,
                defaultLiteral: parsed.literal,
                identity: row.identity || '',
                generated: row.generated === 's' ? row.default_expression : null,
                serial: !!row.serial,
                sequence: row.sequence,
                enumValues: row.enum_values,
                enumType: row.typtype === 'e' ? { schema: row.type_schema, name: row.typname } : null,
                comment: row.comment || '',
                collation: row.collation,
                isBinary: row.is_binary,
            };
        });
    }
    /** primary key columns of tables, in key order */
    async primaryKeys(schema, tables) {
        const { rows } = await this.db.query(`SELECT c.relname AS table, a.attname AS column
       FROM pg_index x
       JOIN pg_class c ON c.oid = x.indrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN LATERAL unnest(x.indkey) WITH ORDINALITY AS k(attnum, position)
       JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
       WHERE x.indisprimary AND n.nspname = $1 AND ($2::text[] IS NULL OR c.relname = ANY($2))
       ORDER BY c.relname, k.position`, [schema, tables]);
        return rows;
    }
    /**
     * foreign keys - of table (referencing: false) or pointing to table (referencing: true).
     * table null - all foreign keys of schema.
     */
    async foreignKeys(schema, table, referencing = false) {
        const side = referencing ? 'fn.nspname = $1 AND ($2::text IS NULL OR fc.relname = $2)' : 'n.nspname = $1 AND ($2::text IS NULL OR c.relname = $2)';
        const { rows } = await this.db.query(`SELECT con.conname, n.nspname AS schema, c.relname AS table, a.attname AS column,
              fn.nspname AS ref_schema, fc.relname AS ref_table, fa.attname AS ref_column,
              con.confupdtype, con.confdeltype
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       JOIN pg_class fc ON fc.oid = con.confrelid JOIN pg_namespace fn ON fn.oid = fc.relnamespace
       CROSS JOIN LATERAL unnest(con.conkey, con.confkey) WITH ORDINALITY AS k(attnum, ref_attnum, position)
       JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
       JOIN pg_attribute fa ON fa.attrelid = con.confrelid AND fa.attnum = k.ref_attnum
       WHERE con.contype = 'f' AND ${side}
       ORDER BY n.nspname, c.relname, con.conname, k.position`, [schema, table]);
        const keys = new Map();
        rows.forEach((row) => {
            const id = `${row.schema}.${row.table}.${row.conname}`;
            if (!keys.has(id)) {
                keys.set(id, {
                    name: row.conname,
                    table: { databaseName: row.schema, name: row.table },
                    columns: [],
                    referencedTable: { databaseName: row.ref_schema, name: row.ref_table },
                    referencedColumns: [],
                    onUpdate: REFERENCE_ACTIONS[row.confupdtype] || row.confupdtype,
                    onDelete: REFERENCE_ACTIONS[row.confdeltype] || row.confdeltype,
                });
            }
            keys.get(id).columns.push(row.column);
            keys.get(id).referencedColumns.push(row.ref_column);
        });
        return Array.from(keys.values());
    }
    async indexes(schema, table) {
        const { rows } = await this.db.query(`SELECT i.relname AS name, x.indisunique AS unique, x.indisprimary AS primary, am.amname AS type,
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
       ORDER BY x.indisprimary DESC, i.relname`, [schema, table]);
        return rows.map((row) => ({
            name: row.name,
            unique: row.unique,
            primary: row.primary,
            type: String(row.type).toUpperCase(),
            columns: row.columns.map((column, index) => ({ name: unquoteName(column), subPart: null, descending: !!row.descending[index] })),
            comment: row.comment || '',
            constraint: row.constraint,
            // pg_get_indexdef always qualifies the table - dump must be importable into other schema
            definition: String(row.definition).replace(/^(CREATE (?:UNIQUE )?INDEX (?:"(?:[^"]|"")+"|\S+) ON (?:ONLY )?)(?:"(?:[^"]|"")+"|[^\s."]+)\.(?:"(?:[^"]|"")+"|\S+)( USING )/, `$1${PostgresSql_1.default.identifier(table)}$2`),
        }));
    }
    async triggers(schema, table) {
        const { rows } = await this.db.query(`SELECT tg.tgname AS name, c.relname AS table, pg_get_triggerdef(tg.oid, true) AS definition, tg.tgfoid::int AS function_oid,
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
       ORDER BY c.relname, tg.tgname`, [schema, table]);
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
    async tableInfo(schema, table) {
        const { rows } = await this.db.query(`SELECT c.relkind, c.reltuples, obj_description(c.oid, 'pg_class') AS comment,
              CASE WHEN c.relkind IN ('r', 'p', 'm') THEN pg_relation_size(c.oid) END AS data_length,
              CASE WHEN c.relkind IN ('r', 'p', 'm') THEN pg_indexes_size(c.oid) END AS index_length,
              am.amname AS access_method
       FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       LEFT JOIN pg_am am ON am.oid = c.relam
       WHERE n.nspname = $1 AND c.relname = $2 AND c.relkind = ANY($3)`, [schema, table, exports.RELATION_KINDS]);
        if (!rows.length) {
            return null;
        }
        const row = rows[0];
        const types = { r: 'BASE TABLE', p: 'PARTITIONED TABLE', v: 'VIEW', m: 'MATERIALIZED VIEW', f: 'FOREIGN TABLE' };
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
    async structureColumns(schema, table) {
        const [columns, indexes] = await Promise.all([this.columns(schema, [table]), this.indexes(schema, table)]);
        const keyOf = (name) => {
            if (indexes.some((index) => index.primary && index.columns.some((column) => column.name === name)))
                return 'PRI';
            if (indexes.some((index) => index.unique && index.columns.length === 1 && index.columns[0].name === name))
                return 'UNI';
            if (indexes.some((index) => { var _a; return ((_a = index.columns[0]) === null || _a === void 0 ? void 0 : _a.name) === name; }))
                return 'MUL';
            return '';
        };
        return columns.map((column) => {
            var _a;
            return ({
                name: column.name,
                type: column.type,
                nullable: column.nullable,
                defaultValue: column.generated || column.serial ? (column.serial ? column.defaultExpression : null) : ((_a = column.defaultLiteral) !== null && _a !== void 0 ? _a : column.defaultExpression),
                defaultIsExpression: column.defaultExpression !== null && column.defaultLiteral === null && !column.generated,
                generationExpression: column.generated,
                extra: PostgresCatalog.columnExtra(column),
                comment: column.comment,
                collation: column.collation,
                key: keyOf(column.name),
            });
        });
    }
    static columnExtra(column) {
        if (column.identity === 'a')
            return 'identity always';
        if (column.identity === 'd')
            return 'identity by default';
        if (column.serial)
            return 'serial';
        if (column.generated)
            return 'STORED GENERATED';
        return '';
    }
    /** column definition of CREATE TABLE */
    static columnDefinition(column, useSerial) {
        const serialTypes = { integer: 'serial', bigint: 'bigserial', smallint: 'smallserial' };
        const parts = [PostgresSql_1.default.identifier(column.name)];
        if (useSerial && column.serial && serialTypes[column.type]) {
            // serial creates the owned sequence itself
            parts.push(serialTypes[column.type]);
            if (!column.nullable)
                parts.push('NOT NULL');
            return parts.join(' ');
        }
        parts.push(column.type);
        if (column.collation)
            parts.push(`COLLATE ${PostgresSql_1.default.identifier(column.collation)}`);
        if (column.generated) {
            parts.push(`GENERATED ALWAYS AS (${column.generated.replace(/^\((.*)\)$/s, '$1')}) STORED`);
        }
        else if (column.identity) {
            parts.push(`GENERATED ${column.identity === 'a' ? 'ALWAYS' : 'BY DEFAULT'} AS IDENTITY`);
        }
        else if (column.defaultExpression !== null) {
            parts.push(`DEFAULT ${column.defaultExpression}`);
        }
        if (!column.nullable)
            parts.push('NOT NULL');
        return parts.join(' ');
    }
    /**
     * CREATE TABLE with columns and constraints.
     * foreignKeys false - foreign keys are left out (dump adds them after data).
     * Names are not schema qualified.
     */
    async createTable(schema, table, options) {
        const [columns, constraints] = await Promise.all([
            this.columns(schema, [table]),
            this.constraints(schema, table),
        ]);
        const lines = [
            ...columns.map((column) => `  ${PostgresCatalog.columnDefinition(column, options.serial)}`),
            ...constraints
                .filter((constraint) => options.foreignKeys || constraint.type !== 'f')
                .map((constraint) => `  CONSTRAINT ${PostgresSql_1.default.identifier(constraint.name)} ${constraint.definition}`),
        ];
        return `CREATE TABLE ${PostgresSql_1.default.identifier(table)} (\n${lines.join(',\n')}\n)`;
    }
    /** constraints of table (primary key first, foreign keys last) - definition from pg_get_constraintdef */
    async constraints(schema, table) {
        const { rows } = await this.db.query(`SELECT con.conname AS name, con.contype AS type, pg_get_constraintdef(con.oid, true) AS definition
       FROM pg_constraint con
       JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = $2 AND con.contype IN ('p', 'u', 'c', 'x', 'f') AND con.conislocal
       ORDER BY CASE con.contype WHEN 'p' THEN 0 WHEN 'u' THEN 1 WHEN 'c' THEN 2 WHEN 'x' THEN 3 ELSE 4 END, con.conname`, [schema, table]);
        return rows;
    }
    /** COMMENT ON statements of table and its columns */
    async comments(schema, table, kind) {
        const [info, columns] = await Promise.all([this.tableInfo(schema, table), this.columns(schema, [table])]);
        const objectType = kind === 'v' ? 'VIEW' : kind === 'm' ? 'MATERIALIZED VIEW' : kind === 'f' ? 'FOREIGN TABLE' : 'TABLE';
        const statements = [];
        if (info === null || info === void 0 ? void 0 : info.comment) {
            statements.push(`COMMENT ON ${objectType} ${PostgresSql_1.default.identifier(table)} IS ${PostgresSql_1.default.literal(info.comment)}`);
        }
        columns.filter((column) => column.comment).forEach((column) => {
            statements.push(`COMMENT ON COLUMN ${PostgresSql_1.default.identifier(table)}.${PostgresSql_1.default.identifier(column.name)} IS ${PostgresSql_1.default.literal(column.comment)}`);
        });
        return statements;
    }
    /** CREATE VIEW / MATERIALIZED VIEW */
    async createView(schema, view, kind) {
        var _a;
        const { rows } = await this.db.query(`SELECT pg_get_viewdef(c.oid, true) AS definition FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relname = $2`, [schema, view]);
        const definition = String(((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.definition) || '').trim().replace(/;$/, '');
        return kind === 'm'
            ? `CREATE MATERIALIZED VIEW ${PostgresSql_1.default.identifier(view)} AS\n${definition}`
            : `CREATE OR REPLACE VIEW ${PostgresSql_1.default.identifier(view)} AS\n${definition}`;
    }
    /** DDL shown in structure view - table with indexes and comments, or view. Client adds semicolon after the last statement */
    async ddl(schema, table) {
        const [relation] = (await this.relations(schema)).filter((item) => item.name === table);
        if (!relation) {
            return '';
        }
        if (relation.kind === 'v' || relation.kind === 'm') {
            return this.createView(schema, table, relation.kind);
        }
        const [create, indexes, comments] = await Promise.all([
            this.createTable(schema, table, { foreignKeys: true, serial: false }),
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
    async enumValues(schema, type) {
        const { rows } = await this.db.query(`SELECT e.enumlabel::text AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = $1 AND t.typname = $2 ORDER BY e.enumsortorder`, [schema, type]);
        return rows.map((row) => row.label);
    }
}
exports.default = PostgresCatalog;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUG9zdGdyZXNDYXRhbG9nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9Qb3N0Z3Jlcy9Qb3N0Z3Jlc0NhdGFsb2cudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsZ0VBQXdDO0FBMkN4QyxrREFBa0Q7QUFDckMsUUFBQSxjQUFjLEdBQUcsQ0FBQyxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDLENBQUM7QUFFeEQsTUFBTSxpQkFBaUIsR0FBNkIsRUFBQyxDQUFDLEVBQUUsV0FBVyxFQUFFLENBQUMsRUFBRSxVQUFVLEVBQUUsQ0FBQyxFQUFFLFNBQVMsRUFBRSxDQUFDLEVBQUUsVUFBVSxFQUFFLENBQUMsRUFBRSxhQUFhLEVBQUMsQ0FBQztBQUVuSSx5RkFBeUY7QUFDekYsTUFBTSxZQUFZLEdBQUcsQ0FBQyxVQUF5QixFQUE2QyxFQUFFO0lBQzVGLElBQUksVUFBVSxLQUFLLElBQUksRUFBRTtRQUN2QixPQUFPLEVBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFDLENBQUM7S0FDdkM7SUFDRCxJQUFJLDhCQUE4QixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRTtRQUNuRCxPQUFPLEVBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFDLENBQUM7S0FDdEM7SUFDRCxNQUFNLE1BQU0sR0FBRyx5Q0FBeUMsQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDMUUsSUFBSSxNQUFNLEVBQUU7UUFDVixPQUFPLEVBQUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUMsQ0FBQztLQUNoRTtJQUNELElBQUksNENBQTRDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxFQUFFO1FBQ2pFLE9BQU8sRUFBQyxPQUFPLEVBQUUsVUFBVSxDQUFDLE9BQU8sQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFDLENBQUM7S0FDN0Y7SUFDRCxJQUFJLGlCQUFpQixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsRUFBRTtRQUN0QyxPQUFPLEVBQUMsT0FBTyxFQUFFLFVBQVUsQ0FBQyxXQUFXLEVBQUUsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFDLENBQUM7S0FDM0Q7SUFDRCxPQUFPLEVBQUMsT0FBTyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFDLENBQUM7QUFDeEMsQ0FBQyxDQUFDO0FBRUYsK0RBQStEO0FBQy9ELE1BQU0sV0FBVyxHQUFHLENBQUMsSUFBWSxFQUFVLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO0FBRTNIOzs7O0dBSUc7QUFDSCxNQUFNLGVBQWU7SUFDbkIsWUFBNkIsRUFBc0I7UUFBdEIsT0FBRSxHQUFGLEVBQUUsQ0FBb0I7SUFDbkQsQ0FBQztJQUVELGdFQUFnRTtJQUNoRSxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQWM7UUFDNUIsTUFBTSxFQUFDLElBQUksRUFBQyxHQUFHLE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQ2hDOzs7MEJBR29CLEVBQ3BCLENBQUMsTUFBTSxFQUFFLHNCQUFjLENBQUMsQ0FDekIsQ0FBQztRQUNGLE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUVELCtGQUErRjtJQUMvRixLQUFLLENBQUMsT0FBTyxDQUFDLE1BQWMsRUFBRSxNQUF1QjtRQUNuRCxNQUFNLEVBQUMsSUFBSSxFQUFDLEdBQUcsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FDaEM7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O29DQW9COEIsRUFDOUIsQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLHNCQUFjLENBQUMsQ0FDakMsQ0FBQztRQUNGLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFO1lBQ3RCLE1BQU0sTUFBTSxHQUFHLFlBQVksQ0FBQyxHQUFHLENBQUMsa0JBQWtCLENBQUMsQ0FBQztZQUNwRCxPQUFPO2dCQUNMLEtBQUssRUFBRSxHQUFHLENBQUMsVUFBVTtnQkFDckIsSUFBSSxFQUFFLEdBQUcsQ0FBQyxJQUFJO2dCQUNkLElBQUksRUFBRSxxQkFBVyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDO2dCQUNyQyxRQUFRLEVBQUUsR0FBRyxDQUFDLFFBQVE7Z0JBQ3RCLGlCQUFpQixFQUFFLE1BQU0sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLGtCQUFrQjtnQkFDaEUsY0FBYyxFQUFFLE1BQU0sQ0FBQyxPQUFPO2dCQUM5QixRQUFRLEVBQUUsR0FBRyxDQUFDLFFBQVEsSUFBSSxFQUFFO2dCQUM1QixTQUFTLEVBQUUsR0FBRyxDQUFDLFNBQVMsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsSUFBSTtnQkFDaEUsTUFBTSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsTUFBTTtnQkFDcEIsUUFBUSxFQUFFLEdBQUcsQ0FBQyxRQUFRO2dCQUN0QixVQUFVLEVBQUUsR0FBRyxDQUFDLFdBQVc7Z0JBQzNCLFFBQVEsRUFBRSxHQUFHLENBQUMsT0FBTyxLQUFLLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLFdBQVcsRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLE9BQU8sRUFBQyxDQUFDLENBQUMsQ0FBQyxJQUFJO2dCQUNuRixPQUFPLEVBQUUsR0FBRyxDQUFDLE9BQU8sSUFBSSxFQUFFO2dCQUMxQixTQUFTLEVBQUUsR0FBRyxDQUFDLFNBQVM7Z0JBQ3hCLFFBQVEsRUFBRSxHQUFHLENBQUMsU0FBUzthQUN4QixDQUFDO1FBQ0osQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDO0lBRUQsa0RBQWtEO0lBQ2xELEtBQUssQ0FBQyxXQUFXLENBQUMsTUFBYyxFQUFFLE1BQXVCO1FBQ3ZELE1BQU0sRUFBQyxJQUFJLEVBQUMsR0FBRyxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUNoQzs7Ozs7OztzQ0FPZ0MsRUFDaEMsQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQ2pCLENBQUM7UUFDRixPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFFRDs7O09BR0c7SUFDSCxLQUFLLENBQUMsV0FBVyxDQUFDLE1BQWMsRUFBRSxLQUFvQixFQUFFLGNBQXVCLEtBQUs7UUFDbEYsTUFBTSxJQUFJLEdBQUcsV0FBVyxDQUFDLENBQUMsQ0FBQywyREFBMkQsQ0FBQyxDQUFDLENBQUMseURBQXlELENBQUM7UUFDbkosTUFBTSxFQUFDLElBQUksRUFBQyxHQUFHLE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQ2hDOzs7Ozs7Ozs7cUNBUytCLElBQUk7OERBQ3FCLEVBQ3hELENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUNoQixDQUFDO1FBQ0YsTUFBTSxJQUFJLEdBQUcsSUFBSSxHQUFHLEVBQXdDLENBQUM7UUFDN0QsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFO1lBQ25CLE1BQU0sRUFBRSxHQUFHLEdBQUcsR0FBRyxDQUFDLE1BQU0sSUFBSSxHQUFHLENBQUMsS0FBSyxJQUFJLEdBQUcsQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUN2RCxJQUFJLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsRUFBRTtnQkFDakIsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLEVBQUU7b0JBQ1gsSUFBSSxFQUFFLEdBQUcsQ0FBQyxPQUFPO29CQUNqQixLQUFLLEVBQUUsRUFBQyxZQUFZLEVBQUUsR0FBRyxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLEtBQUssRUFBQztvQkFDbEQsT0FBTyxFQUFFLEVBQUU7b0JBQ1gsZUFBZSxFQUFFLEVBQUMsWUFBWSxFQUFFLEdBQUcsQ0FBQyxVQUFVLEVBQUUsSUFBSSxFQUFFLEdBQUcsQ0FBQyxTQUFTLEVBQUM7b0JBQ3BFLGlCQUFpQixFQUFFLEVBQUU7b0JBQ3JCLFFBQVEsRUFBRSxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksR0FBRyxDQUFDLFdBQVc7b0JBQy9ELFFBQVEsRUFBRSxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksR0FBRyxDQUFDLFdBQVc7aUJBQ2hFLENBQUMsQ0FBQzthQUNKO1lBQ0QsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN2QyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBRSxDQUFDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDdkQsQ0FBQyxDQUFDLENBQUM7UUFDSCxPQUFPLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDbkMsQ0FBQztJQUVELEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBYyxFQUFFLEtBQWE7UUFDekMsTUFBTSxFQUFDLElBQUksRUFBQyxHQUFHLE1BQU0sSUFBSSxDQUFDLEVBQUUsQ0FBQyxLQUFLLENBQ2hDOzs7Ozs7Ozs7Ozs7K0NBWXlDLEVBQ3pDLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUNoQixDQUFDO1FBQ0YsT0FBTyxJQUFJLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ3hCLElBQUksRUFBRSxHQUFHLENBQUMsSUFBSTtZQUNkLE1BQU0sRUFBRSxHQUFHLENBQUMsTUFBTTtZQUNsQixPQUFPLEVBQUUsR0FBRyxDQUFDLE9BQU87WUFDcEIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsV0FBVyxFQUFFO1lBQ3BDLE9BQU8sRUFBRSxHQUFHLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQWMsRUFBRSxLQUFhLEVBQUUsRUFBRSxDQUFDLENBQUMsRUFBQyxJQUFJLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsVUFBVSxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxFQUFDLENBQUMsQ0FBQztZQUM5SSxPQUFPLEVBQUUsR0FBRyxDQUFDLE9BQU8sSUFBSSxFQUFFO1lBQzFCLFVBQVUsRUFBRSxHQUFHLENBQUMsVUFBVTtZQUMxQix5RkFBeUY7WUFDekYsVUFBVSxFQUFFLE1BQU0sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUMsT0FBTyxDQUN4Qyw4SEFBOEgsRUFDOUgsS0FBSyxxQkFBVyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUN2QztTQUNGLENBQUMsQ0FBQyxDQUFDO0lBQ04sQ0FBQztJQUVELEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBYyxFQUFFLEtBQW9CO1FBQ2pELE1BQU0sRUFBQyxJQUFJLEVBQUMsR0FBRyxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUNoQzs7Ozs7Ozs7Ozs7O3FDQVkrQixFQUMvQixDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FDaEIsQ0FBQztRQUNGLE9BQU8sSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsQ0FBQztZQUN4QixJQUFJLEVBQUUsR0FBRyxDQUFDLElBQUk7WUFDZCxLQUFLLEVBQUUsR0FBRyxDQUFDLEtBQUs7WUFDaEIsTUFBTSxFQUFFLEdBQUcsQ0FBQyxNQUFNO1lBQ2xCLEtBQUssRUFBRSxHQUFHLENBQUMsS0FBSztZQUNoQixTQUFTLEVBQUUsR0FBRyxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsdUNBQXVDLEVBQUUsbUJBQW1CLENBQUM7WUFDL0YsVUFBVSxFQUFFLEdBQUcsQ0FBQyxVQUFVO1lBQzFCLFdBQVcsRUFBRSxHQUFHLENBQUMsWUFBWTtTQUM5QixDQUFDLENBQUMsQ0FBQztJQUNOLENBQUM7SUFFRCxLQUFLLENBQUMsU0FBUyxDQUFDLE1BQWMsRUFBRSxLQUFhO1FBQzNDLE1BQU0sRUFBQyxJQUFJLEVBQUMsR0FBRyxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUNoQzs7Ozs7O3VFQU1pRSxFQUNqRSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsc0JBQWMsQ0FBQyxDQUNoQyxDQUFDO1FBQ0YsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDaEIsT0FBTyxJQUFJLENBQUM7U0FDYjtRQUNELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNwQixNQUFNLEtBQUssR0FBNkIsRUFBQyxDQUFDLEVBQUUsWUFBWSxFQUFFLENBQUMsRUFBRSxtQkFBbUIsRUFBRSxDQUFDLEVBQUUsTUFBTSxFQUFFLENBQUMsRUFBRSxtQkFBbUIsRUFBRSxDQUFDLEVBQUUsZUFBZSxFQUFDLENBQUM7UUFDekksT0FBTztZQUNMLElBQUksRUFBRSxLQUFLLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxJQUFJLEdBQUcsQ0FBQyxPQUFPO1lBQ3ZDLE1BQU0sRUFBRSxHQUFHLENBQUMsYUFBYTtZQUN6QixTQUFTLEVBQUUsSUFBSTtZQUNmLFNBQVMsRUFBRSxJQUFJO1lBQ2YsZ0NBQWdDO1lBQ2hDLElBQUksRUFBRSxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUk7WUFDM0UsVUFBVSxFQUFFLEdBQUcsQ0FBQyxXQUFXLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDO1lBQ3JFLFdBQVcsRUFBRSxHQUFHLENBQUMsWUFBWSxLQUFLLElBQUksQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFlBQVksQ0FBQztZQUN4RSxhQUFhLEVBQUUsSUFBSTtZQUNuQixPQUFPLEVBQUUsR0FBRyxDQUFDLE9BQU8sSUFBSSxFQUFFO1lBQzFCLFVBQVUsRUFBRSxJQUFJO1lBQ2hCLFVBQVUsRUFBRSxJQUFJO1NBQ2pCLENBQUM7SUFDSixDQUFDO0lBRUQsMEVBQTBFO0lBQzFFLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFjLEVBQUUsS0FBYTtRQUNsRCxNQUFNLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLE1BQU0sT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUMsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDM0csTUFBTSxLQUFLLEdBQUcsQ0FBQyxJQUFZLEVBQVUsRUFBRTtZQUNyQyxJQUFJLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUM7Z0JBQUUsT0FBTyxLQUFLLENBQUM7WUFDakgsSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxLQUFLLENBQUMsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxJQUFJLENBQUM7Z0JBQUUsT0FBTyxLQUFLLENBQUM7WUFDeEgsSUFBSSxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsV0FBQyxPQUFBLENBQUEsTUFBQSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQywwQ0FBRSxJQUFJLE1BQUssSUFBSSxDQUFBLEVBQUEsQ0FBQztnQkFBRSxPQUFPLEtBQUssQ0FBQztZQUMzRSxPQUFPLEVBQUUsQ0FBQztRQUNaLENBQUMsQ0FBQztRQUNGLE9BQU8sT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sRUFBRSxFQUFFOztZQUFDLE9BQUEsQ0FBQztnQkFDOUIsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJO2dCQUNqQixJQUFJLEVBQUUsTUFBTSxDQUFDLElBQUk7Z0JBQ2pCLFFBQVEsRUFBRSxNQUFNLENBQUMsUUFBUTtnQkFDekIsWUFBWSxFQUFFLE1BQU0sQ0FBQyxTQUFTLElBQUksTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLE1BQUEsTUFBTSxDQUFDLGNBQWMsbUNBQUksTUFBTSxDQUFDLGlCQUFpQixDQUFDO2dCQUN6SixtQkFBbUIsRUFBRSxNQUFNLENBQUMsaUJBQWlCLEtBQUssSUFBSSxJQUFJLE1BQU0sQ0FBQyxjQUFjLEtBQUssSUFBSSxJQUFJLENBQUMsTUFBTSxDQUFDLFNBQVM7Z0JBQzdHLG9CQUFvQixFQUFFLE1BQU0sQ0FBQyxTQUFTO2dCQUN0QyxLQUFLLEVBQUUsZUFBZSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUM7Z0JBQzFDLE9BQU8sRUFBRSxNQUFNLENBQUMsT0FBTztnQkFDdkIsU0FBUyxFQUFFLE1BQU0sQ0FBQyxTQUFTO2dCQUMzQixHQUFHLEVBQUUsS0FBSyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUM7YUFDeEIsQ0FBQyxDQUFBO1NBQUEsQ0FBQyxDQUFDO0lBQ04sQ0FBQztJQUVELE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBOEI7UUFDL0MsSUFBSSxNQUFNLENBQUMsUUFBUSxLQUFLLEdBQUc7WUFBRSxPQUFPLGlCQUFpQixDQUFDO1FBQ3RELElBQUksTUFBTSxDQUFDLFFBQVEsS0FBSyxHQUFHO1lBQUUsT0FBTyxxQkFBcUIsQ0FBQztRQUMxRCxJQUFJLE1BQU0sQ0FBQyxNQUFNO1lBQUUsT0FBTyxRQUFRLENBQUM7UUFDbkMsSUFBSSxNQUFNLENBQUMsU0FBUztZQUFFLE9BQU8sa0JBQWtCLENBQUM7UUFDaEQsT0FBTyxFQUFFLENBQUM7SUFDWixDQUFDO0lBRUQsd0NBQXdDO0lBQ3hDLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQyxNQUE4QixFQUFFLFNBQWtCO1FBQ3hFLE1BQU0sV0FBVyxHQUE2QixFQUFDLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRSxRQUFRLEVBQUUsYUFBYSxFQUFDLENBQUM7UUFDaEgsTUFBTSxLQUFLLEdBQUcsQ0FBQyxxQkFBVyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUNwRCxJQUFJLFNBQVMsSUFBSSxNQUFNLENBQUMsTUFBTSxJQUFJLFdBQVcsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDMUQsMkNBQTJDO1lBQzNDLEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ3JDLElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUTtnQkFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1lBQzdDLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQztTQUN4QjtRQUNELEtBQUssQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3hCLElBQUksTUFBTSxDQUFDLFNBQVM7WUFBRSxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcscUJBQVcsQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLFNBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN4RixJQUFJLE1BQU0sQ0FBQyxTQUFTLEVBQUU7WUFDcEIsS0FBSyxDQUFDLElBQUksQ0FBQyx3QkFBd0IsTUFBTSxDQUFDLFNBQVMsQ0FBQyxPQUFPLENBQUMsYUFBYSxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztTQUM3RjthQUFNLElBQUksTUFBTSxDQUFDLFFBQVEsRUFBRTtZQUMxQixLQUFLLENBQUMsSUFBSSxDQUFDLGFBQWEsTUFBTSxDQUFDLFFBQVEsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsWUFBWSxjQUFjLENBQUMsQ0FBQztTQUMxRjthQUFNLElBQUksTUFBTSxDQUFDLGlCQUFpQixLQUFLLElBQUksRUFBRTtZQUM1QyxLQUFLLENBQUMsSUFBSSxDQUFDLFdBQVcsTUFBTSxDQUFDLGlCQUFpQixFQUFFLENBQUMsQ0FBQztTQUNuRDtRQUNELElBQUksQ0FBQyxNQUFNLENBQUMsUUFBUTtZQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDN0MsT0FBTyxLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQ3pCLENBQUM7SUFFRDs7OztPQUlHO0lBQ0gsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFjLEVBQUUsS0FBYSxFQUFFLE9BQWdEO1FBQy9GLE1BQU0sQ0FBQyxPQUFPLEVBQUUsV0FBVyxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDO1lBQy9DLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDN0IsSUFBSSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDO1NBQ2hDLENBQUMsQ0FBQztRQUNILE1BQU0sS0FBSyxHQUFHO1lBQ1osR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxLQUFLLGVBQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUM7WUFDM0YsR0FBRyxXQUFXO2lCQUNYLE1BQU0sQ0FBQyxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLFdBQVcsSUFBSSxVQUFVLENBQUMsSUFBSSxLQUFLLEdBQUcsQ0FBQztpQkFDdEUsR0FBRyxDQUFDLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxnQkFBZ0IscUJBQVcsQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxVQUFVLEVBQUUsQ0FBQztTQUMzRyxDQUFDO1FBQ0YsT0FBTyxnQkFBZ0IscUJBQVcsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO0lBQ3BGLENBQUM7SUFFRCx5R0FBeUc7SUFDekcsS0FBSyxDQUFDLFdBQVcsQ0FBQyxNQUFjLEVBQUUsS0FBYTtRQUM3QyxNQUFNLEVBQUMsSUFBSSxFQUFDLEdBQUcsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FDaEM7Ozs7eUhBSW1ILEVBQ25ILENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUNoQixDQUFDO1FBQ0YsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBRUQscURBQXFEO0lBQ3JELEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBYyxFQUFFLEtBQWEsRUFBRSxJQUFZO1FBQ3hELE1BQU0sQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUMxRyxNQUFNLFVBQVUsR0FBRyxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDLG1CQUFtQixDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssR0FBRyxDQUFDLENBQUMsQ0FBQyxlQUFlLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUN6SCxNQUFNLFVBQVUsR0FBYSxFQUFFLENBQUM7UUFDaEMsSUFBSSxJQUFJLGFBQUosSUFBSSx1QkFBSixJQUFJLENBQUUsT0FBTyxFQUFFO1lBQ2pCLFVBQVUsQ0FBQyxJQUFJLENBQUMsY0FBYyxVQUFVLElBQUkscUJBQVcsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLE9BQU8scUJBQVcsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztTQUN0SDtRQUNELE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxNQUFNLEVBQUUsRUFBRTtZQUM1RCxVQUFVLENBQUMsSUFBSSxDQUFDLHFCQUFxQixxQkFBVyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxxQkFBVyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8scUJBQVcsQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN6SixDQUFDLENBQUMsQ0FBQztRQUNILE9BQU8sVUFBVSxDQUFDO0lBQ3BCLENBQUM7SUFFRCxzQ0FBc0M7SUFDdEMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxNQUFjLEVBQUUsSUFBWSxFQUFFLElBQVk7O1FBQ3pELE1BQU0sRUFBQyxJQUFJLEVBQUMsR0FBRyxNQUFNLElBQUksQ0FBQyxFQUFFLENBQUMsS0FBSyxDQUNoQzsrQ0FDeUMsRUFDekMsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQ2YsQ0FBQztRQUNGLE1BQU0sVUFBVSxHQUFHLE1BQU0sQ0FBQyxDQUFBLE1BQUEsSUFBSSxDQUFDLENBQUMsQ0FBQywwQ0FBRSxVQUFVLEtBQUksRUFBRSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsQ0FBQztRQUM5RSxPQUFPLElBQUksS0FBSyxHQUFHO1lBQ2pCLENBQUMsQ0FBQyw0QkFBNEIscUJBQVcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVEsVUFBVSxFQUFFO1lBQzlFLENBQUMsQ0FBQywwQkFBMEIscUJBQVcsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFFBQVEsVUFBVSxFQUFFLENBQUM7SUFDakYsQ0FBQztJQUVELDZIQUE2SDtJQUM3SCxLQUFLLENBQUMsR0FBRyxDQUFDLE1BQWMsRUFBRSxLQUFhO1FBQ3JDLE1BQU0sQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxLQUFLLENBQUMsQ0FBQztRQUN4RixJQUFJLENBQUMsUUFBUSxFQUFFO1lBQ2IsT0FBTyxFQUFFLENBQUM7U0FDWDtRQUNELElBQUksUUFBUSxDQUFDLElBQUksS0FBSyxHQUFHLElBQUksUUFBUSxDQUFDLElBQUksS0FBSyxHQUFHLEVBQUU7WUFDbEQsT0FBTyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ3REO1FBQ0QsTUFBTSxDQUFDLE1BQU0sRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLEdBQUcsTUFBTSxPQUFPLENBQUMsR0FBRyxDQUFDO1lBQ3BELElBQUksQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxFQUFDLFdBQVcsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBQyxDQUFDO1lBQ25FLElBQUksQ0FBQyxPQUFPLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQztZQUMzQixJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxLQUFLLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQztTQUM1QyxDQUFDLENBQUM7UUFDSCxPQUFPO1lBQ0wsTUFBTTtZQUNOLEdBQUcsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDO1lBQ2hGLEdBQUcsUUFBUTtTQUNaLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQ2xCLENBQUM7SUFFRCwwQkFBMEI7SUFDMUIsS0FBSyxDQUFDLFVBQVUsQ0FBQyxNQUFjLEVBQUUsSUFBWTtRQUMzQyxNQUFNLEVBQUMsSUFBSSxFQUFDLEdBQUcsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FDaEM7d0VBQ2tFLEVBQ2xFLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxDQUNmLENBQUM7UUFDRixPQUFPLElBQUksQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUN0QyxDQUFDO0NBQ0Y7QUFFRCxrQkFBZSxlQUFlLENBQUMifQ==