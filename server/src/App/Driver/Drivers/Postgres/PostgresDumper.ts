import {Pool, PoolClient} from 'pg';
import {DumpOptionsInterface} from '../../Interface/Data/TransferInterface';
import PostgresSql from './PostgresSql';
import PostgresCatalog, {CatalogColumnInterface} from './PostgresCatalog';
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
  private client: PoolClient | null = null;
  private catalog: PostgresCatalog | null = null;
  private tables = 0;
  private rows = 0;

  constructor(private readonly pool: Pool, private readonly options: DumpOptionsInterface) {
  }

  async dump(write: (text: string) => Promise<void>): Promise<{tables: number, rows: number}> {
    this.client = await this.pool.connect();
    this.catalog = new PostgresCatalog(this.client);
    const schema = this.options.database;
    const id = PostgresSql.identifier;

    try {
      await this.client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      // names of the schema are written without schema - dump can be imported into other schema
      await this.client.query(`SET LOCAL search_path TO ${id(schema)}`);

      const relations = (await this.catalog.relations(schema))
        .filter((relation) => !this.options.tables.length || this.options.tables.includes(relation.name));
      const tables = relations.filter((relation) => ['r', 'p'].includes(relation.kind)).map((relation) => relation.name);
      const views = relations.filter((relation) => ['v', 'm'].includes(relation.kind));
      const columns = await this.catalog.columns(schema, tables.length ? tables : ['']);
      const columnsOf = (table: string) => columns.filter((column) => column.table === table);
      const foreignKeys = (await this.catalog.foreignKeys(schema, null)).filter((key) => tables.includes(key.table.name));
      const ordered = PostgresDumper.orderByForeignKeys(tables, foreignKeys);

      const {rows: [server]} = await this.client.query("SELECT version() AS version, current_database() AS database");
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
          const create = await this.catalog.createTable(schema, table, {foreignKeys: false, serial: true});
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
          const kind = relations.find((relation) => relation.name === table)!.kind;
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
      return {tables: this.tables, rows: this.rows};
    } catch (e) {
      await this.client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      this.client.release();
      this.client = null;
    }
  }

  /** enum types of dumped columns - created only when missing (other tables can use them) */
  private async writeTypes(schema: string, columns: CatalogColumnInterface[], write: (text: string) => Promise<void>): Promise<void> {
    const types = Array.from(new Set(columns.filter((column) => column.enumType?.schema === schema).map((column) => column.enumType!.name)));
    for (const type of types) {
      const values = await this.catalog!.enumValues(schema, type);
      await write(`--\n-- Type ${PostgresSql.identifier(type)}\n--\n\n`
        + `DO $flase$ BEGIN\n  CREATE TYPE ${PostgresSql.identifier(type)} AS ENUM (${values.map((value) => PostgresSql.literal(value)).join(', ')});\n`
        + 'EXCEPTION WHEN duplicate_object THEN NULL;\nEND $flase$;\n\n');
    }
  }

  /** functions of triggers which belong to the schema */
  private async writeFunctions(schema: string, oids: number[], write: (text: string) => Promise<void>): Promise<void> {
    if (!oids.length) return;
    const {rows} = await this.client!.query(
      `SELECT p.proname AS name, pg_get_functiondef(p.oid) AS definition
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE p.oid = ANY($1) AND n.nspname = $2 ORDER BY p.proname`,
      [Array.from(new Set(oids)), schema],
    );
    for (const row of rows) {
      // CREATE OR REPLACE FUNCTION schema.name( -> name of target schema
      const definition = String(row.definition).trim().replace(
        /^(CREATE OR REPLACE FUNCTION\s+)("(?:[^"]|"")+"|[^\s.(]+)\./i,
        '$1',
      );
      await write(`--\n-- Function ${PostgresSql.identifier(row.name)}\n--\n\n${definition};\n\n`);
    }
  }

  /** INSERT statements of about 1 MB, generated columns are left out (they cannot be inserted) */
  private async dumpData(table: string, columns: CatalogColumnInterface[], write: (text: string) => Promise<void>): Promise<void> {
    const dumped = columns.filter((column) => !column.generated);
    if (!dumped.length) return;
    const id = PostgresSql.identifier;
    // GENERATED ALWAYS identity accepts own values only with OVERRIDING
    const overriding = dumped.some((column) => column.identity === 'a') ? ' OVERRIDING SYSTEM VALUE' : '';
    const insertStart = `INSERT INTO ${id(table)} (${PostgresSql.identifiers(dumped.map((column) => column.name))})${overriding} VALUES\n`;
    const cursor = this.client!.query(new Cursor(
      `SELECT ${PostgresSql.identifiers(dumped.map((column) => column.name))} FROM ${PostgresSql.table(this.options.database, table)}`,
      [],
      {types: PostgresSql.types, rowMode: 'array'},
    ));
    const read = (): Promise<any[][]> => new Promise((resolve, reject) => {
      cursor.read(CURSOR_ROWS, (err: Error | null, rows: any[][]) => err ? reject(err) : resolve(rows));
    });
    // booleans and small numbers are converted by type parsers - literals must keep type
    const literal = (value: any, column: CatalogColumnInterface) => column.type === 'boolean' && value !== null
      ? (value === 'true' ? 'true' : 'false')
      : PostgresSql.literal(value);

    let batch: string[] = [];
    let batchBytes = 0;
    let headerWritten = false;
    const flush = async () => {
      if (!batch.length) return;
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
        if (rows.length < CURSOR_ROWS) break;
      }
    } finally {
      await new Promise<void>((resolve) => cursor.close(() => resolve()));
    }
    await flush();
    if (headerWritten) {
      await write('\n');
    }
  }

  /** serial / identity sequences continue after imported values */
  private async writeSequenceValues(columns: CatalogColumnInterface[], write: (text: string) => Promise<void>): Promise<void> {
    const statements: string[] = [];
    for (const column of columns.filter((item) => item.sequence && (item.serial || item.identity))) {
      const {rows: [sequence]} = await this.client!.query(`SELECT last_value, is_called FROM ${column.sequence}`);
      statements.push(`SELECT pg_catalog.setval(pg_get_serial_sequence(${PostgresSql.literal(PostgresSql.identifier(column.table))}, ${PostgresSql.literal(column.name)}), ${sequence.last_value}, ${sequence.is_called ? 'true' : 'false'});`);
    }
    if (statements.length) {
      await write(`--\n-- Sequence values\n--\n\n${statements.join('\n')}\n\n`);
    }
  }

  /** views used by other views are created first */
  private async orderViews(schema: string, views: {name: string, kind: string, oid: number}[]): Promise<{name: string, kind: string, oid: number}[]> {
    if (views.length < 2) return views;
    const {rows} = await this.client!.query(
      `SELECT DISTINCT v.oid::int AS view, d.refobjid::int AS used
       FROM pg_class v
       JOIN pg_rewrite r ON r.ev_class = v.oid
       JOIN pg_depend d ON d.objid = r.oid AND d.classid = 'pg_rewrite'::regclass AND d.refobjid <> v.oid
       WHERE v.oid = ANY($1)`,
      [views.map((view) => view.oid)],
    );
    const ordered: typeof views = [];
    const visit = (view: typeof views[0], path: Set<number>) => {
      if (ordered.includes(view) || path.has(view.oid)) return;
      path.add(view.oid);
      rows.filter((row) => row.view === view.oid).forEach((row) => {
        const used = views.find((item) => item.oid === row.used);
        if (used) visit(used, path);
      });
      ordered.push(view);
    };
    views.forEach((view) => visit(view, new Set()));
    return ordered;
  }

  /** referenced tables first - data-only dump can be imported with foreign keys checked */
  private static orderByForeignKeys(tables: string[], keys: {table: {name: string}, referencedTable: {databaseName: string, name: string}}[]): string[] {
    const ordered: string[] = [];
    const visit = (table: string, path: Set<string>) => {
      if (ordered.includes(table) || path.has(table)) return;
      path.add(table);
      keys.filter((key) => key.table.name === table && key.referencedTable.name !== table && tables.includes(key.referencedTable.name))
        .forEach((key) => visit(key.referencedTable.name, path));
      ordered.push(table);
    };
    tables.forEach((table) => visit(table, new Set()));
    return ordered;
  }
}

export default PostgresDumper;
