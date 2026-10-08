"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const PostgresSql_1 = __importDefault(require("./PostgresSql"));
const PostgresCatalog_1 = __importDefault(require("./PostgresCatalog"));
const Cursor = require('pg-cursor');
/** one INSERT statement holds about this many bytes of values */
const INSERT_BATCH_BYTES = 1024 * 1024;
const CURSOR_ROWS = 500;
/**
 * SQL dump of schema / tables, written as stream (data are never kept in memory).
 * Everything is read in one REPEATABLE READ transaction - consistent snapshot.
 * Order: types, functions, tables without foreign keys, data, sequences, indexes, foreign keys, views, triggers
 * (as pg_dump - data load does not depend on order of tables).
 * @author Mateusz Bochen
 */
class PostgresDumper {
    constructor(pool, options) {
        this.pool = pool;
        this.options = options;
        this.client = null;
        this.catalog = null;
        this.tables = 0;
        this.rows = 0;
    }
    async dump(write) {
        this.client = await this.pool.connect();
        this.catalog = new PostgresCatalog_1.default(this.client);
        const schema = this.options.database;
        const id = PostgresSql_1.default.identifier;
        try {
            await this.client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
            // names of the schema are written without schema - dump can be imported into other schema
            await this.client.query(`SET LOCAL search_path TO ${id(schema)}`);
            const relations = (await this.catalog.relations(schema))
                .filter((relation) => !this.options.tables.length || this.options.tables.includes(relation.name));
            const tables = relations.filter((relation) => ['r', 'p'].includes(relation.kind)).map((relation) => relation.name);
            const views = relations.filter((relation) => ['v', 'm'].includes(relation.kind));
            const columns = await this.catalog.columns(schema, tables.length ? tables : ['']);
            const columnsOf = (table) => columns.filter((column) => column.table === table);
            const foreignKeys = (await this.catalog.foreignKeys(schema, null)).filter((key) => tables.includes(key.table.name));
            const ordered = PostgresDumper.orderByForeignKeys(tables, foreignKeys);
            const { rows: [server] } = await this.client.query("SELECT version() AS version, current_database() AS database");
            await write([
                '-- Flase SQL dump',
                `-- Server: ${server.version}`,
                `-- Database: ${server.database}  Schema: ${schema}`,
                `-- Generated: ${new Date().toISOString()}`,
                '',
                "SET client_encoding = 'UTF8';",
                'SET standard_conforming_strings = on;',
                // functions can use tables created later
                'SET check_function_bodies = false;',
                '',
            ].join('\n') + '\n');
            if (this.options.createDatabase) {
                await write(`CREATE SCHEMA IF NOT EXISTS ${id(schema)};\nSET search_path TO ${id(schema)}, public;\n\n`);
            }
            const triggers = this.options.structure && this.options.triggers && tables.length
                ? (await this.catalog.triggers(schema, null)).filter((trigger) => tables.includes(trigger.table))
                : [];
            if (this.options.structure) {
                await this.writeTypes(schema, columns, write);
                await this.writeFunctions(schema, triggers.map((trigger) => trigger.functionOid), write);
                if (this.options.dropTables) {
                    const viewsSql = views.map((view) => `DROP ${view.kind === 'm' ? 'MATERIALIZED VIEW' : 'VIEW'} IF EXISTS ${id(view.name)} CASCADE;\n`).join('');
                    // CASCADE also removes foreign keys of other tables pointing to dropped ones (data stay)
                    const tablesSql = tables.length ? `DROP TABLE IF EXISTS ${tables.map((table) => id(table)).join(', ')} CASCADE;\n` : '';
                    if (viewsSql || tablesSql) {
                        await write(`${viewsSql}${tablesSql}\n`);
                    }
                }
                for (const table of ordered) {
                    const create = await this.catalog.createTable(schema, table, { foreignKeys: false, serial: true });
                    await write(`--\n-- Structure of table ${id(table)}\n--\n\n${create};\n\n`);
                }
            }
            for (const table of ordered) {
                this.tables++;
                if (this.options.data) {
                    await this.dumpData(table, columnsOf(table), write);
                }
            }
            if (this.options.data) {
                await this.writeSequenceValues(columns.filter((column) => tables.includes(column.table)), write);
            }
            if (this.options.structure) {
                for (const table of ordered) {
                    const kind = relations.find((relation) => relation.name === table).kind;
                    const indexes = (await this.catalog.indexes(schema, table)).filter((index) => !index.constraint);
                    const comments = await this.catalog.comments(schema, table, kind);
                    if (indexes.length || comments.length) {
                        await write([...indexes.map((index) => index.definition), ...comments].map((statement) => `${statement};\n`).join('') + '\n');
                    }
                }
                for (const table of ordered) {
                    const keys = (await this.catalog.constraints(schema, table)).filter((constraint) => constraint.type === 'f');
                    if (keys.length) {
                        await write(keys.map((key) => `ALTER TABLE ${id(table)} ADD CONSTRAINT ${id(key.name)} ${key.definition};\n`).join('') + '\n');
                    }
                }
                if (this.options.views) {
                    for (const view of await this.orderViews(schema, views)) {
                        const create = await this.catalog.createView(schema, view.name, view.kind);
                        const comments = await this.catalog.comments(schema, view.name, view.kind);
                        await write(`--\n-- View ${id(view.name)}\n--\n\n${create};\n${comments.map((comment) => `${comment};\n`).join('')}\n`);
                    }
                }
                for (const trigger of triggers) {
                    await write(`--\n-- Trigger ${id(trigger.name)}\n--\n\n`
                        + (this.options.dropTables ? '' : `DROP TRIGGER IF EXISTS ${id(trigger.name)} ON ${id(trigger.table)};\n`)
                        + `${trigger.definition};\n\n`);
                }
            }
            await this.client.query('COMMIT');
            return { tables: this.tables, rows: this.rows };
        }
        catch (e) {
            await this.client.query('ROLLBACK').catch(() => undefined);
            throw e;
        }
        finally {
            this.client.release();
            this.client = null;
        }
    }
    /** enum types of dumped columns - created only when missing (other tables can use them) */
    async writeTypes(schema, columns, write) {
        const types = Array.from(new Set(columns.filter((column) => { var _a; return ((_a = column.enumType) === null || _a === void 0 ? void 0 : _a.schema) === schema; }).map((column) => column.enumType.name)));
        for (const type of types) {
            const values = await this.catalog.enumValues(schema, type);
            await write(`--\n-- Type ${PostgresSql_1.default.identifier(type)}\n--\n\n`
                + `DO $flase$ BEGIN\n  CREATE TYPE ${PostgresSql_1.default.identifier(type)} AS ENUM (${values.map((value) => PostgresSql_1.default.literal(value)).join(', ')});\n`
                + 'EXCEPTION WHEN duplicate_object THEN NULL;\nEND $flase$;\n\n');
        }
    }
    /** functions of triggers which belong to the schema */
    async writeFunctions(schema, oids, write) {
        if (!oids.length)
            return;
        const { rows } = await this.client.query(`SELECT p.proname AS name, pg_get_functiondef(p.oid) AS definition
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE p.oid = ANY($1) AND n.nspname = $2 ORDER BY p.proname`, [Array.from(new Set(oids)), schema]);
        for (const row of rows) {
            // CREATE OR REPLACE FUNCTION schema.name( -> name of target schema
            const definition = String(row.definition).trim().replace(/^(CREATE OR REPLACE FUNCTION\s+)("(?:[^"]|"")+"|[^\s.(]+)\./i, '$1');
            await write(`--\n-- Function ${PostgresSql_1.default.identifier(row.name)}\n--\n\n${definition};\n\n`);
        }
    }
    /** INSERT statements of about 1 MB, generated columns are left out (they cannot be inserted) */
    async dumpData(table, columns, write) {
        const dumped = columns.filter((column) => !column.generated);
        if (!dumped.length)
            return;
        const id = PostgresSql_1.default.identifier;
        // GENERATED ALWAYS identity accepts own values only with OVERRIDING
        const overriding = dumped.some((column) => column.identity === 'a') ? ' OVERRIDING SYSTEM VALUE' : '';
        const insertStart = `INSERT INTO ${id(table)} (${PostgresSql_1.default.identifiers(dumped.map((column) => column.name))})${overriding} VALUES\n`;
        const cursor = this.client.query(new Cursor(`SELECT ${PostgresSql_1.default.identifiers(dumped.map((column) => column.name))} FROM ${PostgresSql_1.default.table(this.options.database, table)}`, [], { types: PostgresSql_1.default.types, rowMode: 'array' }));
        const read = () => new Promise((resolve, reject) => {
            cursor.read(CURSOR_ROWS, (err, rows) => err ? reject(err) : resolve(rows));
        });
        // booleans and small numbers are converted by type parsers - literals must keep type
        const literal = (value, column) => column.type === 'boolean' && value !== null
            ? (value === 'true' ? 'true' : 'false')
            : PostgresSql_1.default.literal(value);
        let batch = [];
        let batchBytes = 0;
        let headerWritten = false;
        const flush = async () => {
            if (!batch.length)
                return;
            if (!headerWritten) {
                await write(`--\n-- Data of table ${id(table)}\n--\n\n`);
                headerWritten = true;
            }
            await write(`${insertStart}${batch.join(',\n')};\n`);
            batch = [];
            batchBytes = 0;
        };
        try {
            for (;;) {
                // next rows are read only after previous ones are written - backpressure of the download
                const rows = await read();
                for (const row of rows) {
                    const values = `(${row.map((value, index) => literal(value, dumped[index])).join(', ')})`;
                    batch.push(values);
                    batchBytes += values.length;
                    this.rows++;
                    if (batchBytes >= INSERT_BATCH_BYTES) {
                        await flush();
                    }
                }
                if (rows.length < CURSOR_ROWS)
                    break;
            }
        }
        finally {
            await new Promise((resolve) => cursor.close(() => resolve()));
        }
        await flush();
        if (headerWritten) {
            await write('\n');
        }
    }
    /** serial / identity sequences continue after imported values */
    async writeSequenceValues(columns, write) {
        const statements = [];
        for (const column of columns.filter((item) => item.sequence && (item.serial || item.identity))) {
            const { rows: [sequence] } = await this.client.query(`SELECT last_value, is_called FROM ${column.sequence}`);
            statements.push(`SELECT pg_catalog.setval(pg_get_serial_sequence(${PostgresSql_1.default.literal(PostgresSql_1.default.identifier(column.table))}, ${PostgresSql_1.default.literal(column.name)}), ${sequence.last_value}, ${sequence.is_called ? 'true' : 'false'});`);
        }
        if (statements.length) {
            await write(`--\n-- Sequence values\n--\n\n${statements.join('\n')}\n\n`);
        }
    }
    /** views used by other views are created first */
    async orderViews(schema, views) {
        if (views.length < 2)
            return views;
        const { rows } = await this.client.query(`SELECT DISTINCT v.oid::int AS view, d.refobjid::int AS used
       FROM pg_class v
       JOIN pg_rewrite r ON r.ev_class = v.oid
       JOIN pg_depend d ON d.objid = r.oid AND d.classid = 'pg_rewrite'::regclass AND d.refobjid <> v.oid
       WHERE v.oid = ANY($1)`, [views.map((view) => view.oid)]);
        const ordered = [];
        const visit = (view, path) => {
            if (ordered.includes(view) || path.has(view.oid))
                return;
            path.add(view.oid);
            rows.filter((row) => row.view === view.oid).forEach((row) => {
                const used = views.find((item) => item.oid === row.used);
                if (used)
                    visit(used, path);
            });
            ordered.push(view);
        };
        views.forEach((view) => visit(view, new Set()));
        return ordered;
    }
    /** referenced tables first - data-only dump can be imported with foreign keys checked */
    static orderByForeignKeys(tables, keys) {
        const ordered = [];
        const visit = (table, path) => {
            if (ordered.includes(table) || path.has(table))
                return;
            path.add(table);
            keys.filter((key) => key.table.name === table && key.referencedTable.name !== table && tables.includes(key.referencedTable.name))
                .forEach((key) => visit(key.referencedTable.name, path));
            ordered.push(table);
        };
        tables.forEach((table) => visit(table, new Set()));
        return ordered;
    }
}
exports.default = PostgresDumper;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUG9zdGdyZXNEdW1wZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvQXBwL0RyaXZlci9Ecml2ZXJzL1Bvc3RncmVzL1Bvc3RncmVzRHVtcGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7O0FBRUEsZ0VBQXdDO0FBQ3hDLHdFQUEwRTtBQUMxRSxNQUFNLE1BQU0sR0FBRyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUM7QUFFcEMsaUVBQWlFO0FBQ2pFLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUN2QyxNQUFNLFdBQVcsR0FBRyxHQUFHLENBQUM7QUFFeEI7Ozs7OztHQU1HO0FBQ0gsTUFBTSxjQUFjO0lBTWxCLFlBQTZCLElBQVUsRUFBbUIsT0FBNkI7UUFBMUQsU0FBSSxHQUFKLElBQUksQ0FBTTtRQUFtQixZQUFPLEdBQVAsT0FBTyxDQUFzQjtRQUwvRSxXQUFNLEdBQXNCLElBQUksQ0FBQztRQUNqQyxZQUFPLEdBQTJCLElBQUksQ0FBQztRQUN2QyxXQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsU0FBSSxHQUFHLENBQUMsQ0FBQztJQUdqQixDQUFDO0lBRUQsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFzQztRQUMvQyxJQUFJLENBQUMsTUFBTSxHQUFHLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUN4QyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUkseUJBQWUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDaEQsTUFBTSxNQUFNLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUM7UUFDckMsTUFBTSxFQUFFLEdBQUcscUJBQVcsQ0FBQyxVQUFVLENBQUM7UUFFbEMsSUFBSTtZQUNGLE1BQU0sSUFBSSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsaURBQWlELENBQUMsQ0FBQztZQUMzRSwwRkFBMEY7WUFDMUYsTUFBTSxJ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