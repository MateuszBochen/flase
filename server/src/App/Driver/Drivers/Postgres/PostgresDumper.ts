import {Pool, PoolClient} from 'pg';
import {DumpOptionsInterface} from '../../Interface/Data/TransferInterface';
import {dumpPartsOf, DumpProgressCallbackType, DumpProgressType} from '../../../Transfer/DumpParts';
import PostgresSql from './PostgresSql';
import PostgresCatalog, {CatalogColumnInterface} from './PostgresCatalog';
import PostgresFunctions from './PostgresFunctions';
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
  private readonly progress: DumpProgressType = {table: null, tablesDone: 0, tablesTotal: 0, rows: 0, estimatedRows: 0};
  /** primary key columns of tables - upsert / UPDATE of data */
  private primaryKeys = new Map<string, string[]>();
  private readonly withoutPrimaryKey: string[] = [];
  /** connection was closed by server - cursor would wait for rows forever */
  private connectionError: Error | null = null;
  private readonly connectionLost = new Set<(error: Error) => void>();

  constructor(private readonly pool: Pool, private readonly options: DumpOptionsInterface,
              private readonly onProgress: DumpProgressCallbackType = () => undefined,
              private readonly functions: PostgresFunctions = new PostgresFunctions()) {
  }

  async dump(write: (text: string) => Promise<void>): Promise<{tables: number, rows: number, withoutPrimaryKey: string[]}> {
    this.client = await this.pool.connect();
    // connection closed by server while dump waits for the download (restart, pg_terminate_backend) - 'error' without
    // listener would stop the whole server; next query of the dump fails with it
    const onError = (error: Error) => {
      if (!this.connectionError) console.log('PostgreSQL connection of dump failed', error.message);
      this.connectionError = this.connectionError || error;
      this.connectionLost.forEach((reject) => reject(this.connectionError!));
    };
    this.client.on('error', onError);
    this.catalog = new PostgresCatalog(this.client, this.functions);
    const schema = this.options.database;
    const id = PostgresSql.identifier;

    try {
      await this.client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      // names of the schema are written without schema - dump can be imported into other schema
      await this.client.query(`SET LOCAL search_path TO ${id(schema)}`);

      // nothing is written yet - missing schema or table is reported as error, not as empty dump
      if (!(await this.client.query('SELECT 1 FROM pg_namespace WHERE nspname = $1', [schema])).rowCount) {
        throw new Error(`Schema ${schema} does not exist`);
      }
      const allRelations = await this.catalog.relations(schema);
      const missing = this.options.tables.filter((table) => !allRelations.some((relation) => relation.name === table));
      if (missing.length) {
        throw new Error(`Tables do not exist: ${missing.join(', ')}`);
      }
      const relations = allRelations.filter((relation) => !this.options.tables.length || this.options.tables.includes(relation.name));
      const tables = relations.filter((relation) => ['r', 'p'].includes(relation.kind)).map((relation) => relation.name);
      const parts = (name: string) => dumpPartsOf(this.options, name);
      const views = relations.filter((relation) => ['v', 'm'].includes(relation.kind) && parts(relation.name).structure);
      const structureTables = tables.filter((table) => parts(table).structure);
      const dataTables = tables.filter((table) => parts(table).data);
      const structure = structureTables.length > 0 || (this.options.views && views.length > 0);
      const columns = await this.catalog.columns(schema, tables.length ? tables : ['']);
      const columnsOf = (table: string) => columns.filter((column) => column.table === table);
      const schemaKeys = await this.catalog.foreignKeys(schema, null);
      const foreignKeys = schemaKeys.filter((key) => tables.includes(key.table.name));
      const ordered = PostgresDumper.orderByForeignKeys(tables, foreignKeys);
      this.progress.tablesTotal = tables.length;
      this.progress.estimatedRows = await this.estimateRows(schema, dataTables);
      this.report();
      if (['upsert', 'update'].includes(this.options.insertMode || '') && dataTables.length) {
        (await this.catalog.primaryKeys(schema, dataTables))
          .forEach((key) => this.primaryKeys.set(key.table, [...(this.primaryKeys.get(key.table) || []), key.column]));
      }

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

      const triggers = this.options.triggers && structureTables.length
        ? (await this.catalog.triggers(schema, null)).filter((trigger) => structureTables.includes(trigger.table))
        : [];

      if (structure) {
        await this.writeTypes(schema, columns.filter((column) => structureTables.includes(column.table)), write);
        await this.writeFunctions(schema, triggers.map((trigger) => trigger.functionOid), write);

        if (this.options.dropTables) {
          const viewsSql = (this.options.views ? views : []).map((view) => `DROP ${view.kind === 'm' ? 'MATERIALIZED VIEW' : 'VIEW'} IF EXISTS ${id(view.name)} CASCADE;\n`).join('');
          // CASCADE also removes foreign keys of other tables pointing to dropped ones (data stay)
          const tablesSql = structureTables.length ? `DROP TABLE IF EXISTS ${structureTables.map((table) => id(table)).join(', ')} CASCADE;\n` : '';
          if (viewsSql || tablesSql) {
            await write(`${viewsSql}${tablesSql}\n`);
          }
        }
        for (const table of ordered.filter((name) => parts(name).structure)) {
          const create = await this.catalog.createTable(schema, table, {foreignKeys: false, serial: true});
          await write(`--\n-- Structure of table ${id(table)}\n--\n\n${create};\n\n`);
        }
      }

      // data only tables are emptied at once - foreign keys between them do not stop TRUNCATE
      const truncated = this.options.truncateData && this.options.insertMode !== 'update'
        ? ordered.filter((table) => parts(table).data && !parts(table).structure)
        : [];
      if (truncated.length) {
        await write(`TRUNCATE TABLE ${truncated.map((table) => id(table)).join(', ')};\n\n`);
      }

      for (const table of ordered) {
        this.tables++;
        this.progress.table = table;
        this.report();
        if (parts(table).data) {
          await this.dumpData(table, columnsOf(table), write);
        }
        this.progress.tablesDone++;
      }
      this.progress.table = null;
      this.report();

      if (dataTables.length) {
        await this.writeSequenceValues(columns.filter((column) => dataTables.includes(column.table)), write);
      }

      if (structure) {
        for (const table of ordered.filter((name) => parts(name).structure)) {
          const kind = relations.find((relation) => relation.name === table)!.kind;
          const indexes = (await this.catalog.indexes(schema, table)).filter((index) => !index.constraint);
          const comments = await this.catalog.comments(schema, table, kind);
          if (indexes.length || comments.length) {
            await write([...indexes.map((index) => index.definition), ...comments].map((statement) => `${statement};\n`).join('') + '\n');
          }
        }
        for (const table of ordered.filter((name) => parts(name).structure)) {
          const keys = (await this.catalog.constraints(schema, table)).filter((constraint) => constraint.type === 'f');
          if (keys.length) {
            await write(keys.map((key) => `ALTER TABLE ${id(table)} ADD CONSTRAINT ${id(key.name)} ${key.definition};\n`).join('') + '\n');
          }
        }
        if (this.options.dropTables) {
          await this.writeKeysOfOtherTables(schema, schemaKeys, structureTables, write);
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
      this.report();
      return {tables: this.tables, rows: this.rows, withoutPrimaryKey: this.withoutPrimaryKey};
    } catch (e) {
      if (!this.connectionError) {
        await this.client.query('ROLLBACK').catch(() => undefined);
      }
      throw this.connectionError || e;
    } finally {
      this.client.off('error', onError);
      // broken connection is closed, not returned to the pool
      this.client.release(this.connectionError || undefined);
      this.client = null;
    }
  }

  /**
   * DROP TABLE ... CASCADE removed foreign keys of tables which are not created by the dump (Data only or not dumped)
   * pointing to dropped tables - they are added again, only when the table exists and the key is missing
   * (dump imported into other schema need not have them)
   */
  private async writeKeysOfOtherTables(schema: string, keys: {name: string, table: {databaseName: string, name: string},
      referencedTable: {databaseName: string, name: string}}[], created: string[], write: (text: string) => Promise<void>): Promise<void> {
    const id = PostgresSql.identifier;
    const lost = keys.filter((key) => key.referencedTable.databaseName === schema && created.includes(key.referencedTable.name)
      && !(key.table.databaseName === schema && created.includes(key.table.name)));
    if (!lost.length) return;
    let sql = '--\n-- Foreign keys of other tables referencing created tables (removed by DROP ... CASCADE)\n--\n\n';
    for (const key of lost) {
      const definition = (await this.catalog!.constraints(key.table.databaseName, key.table.name)).find((constraint) => constraint.name === key.name)?.definition;
      if (!definition) continue;
      const table = key.table.databaseName === schema ? id(key.table.name) : PostgresSql.table(key.table.databaseName, key.table.name);
      sql += `DO $flase$ BEGIN\n  IF to_regclass(${PostgresSql.literal(table)}) IS NOT NULL AND NOT EXISTS (\n`
        + `    SELECT 1 FROM pg_constraint WHERE conname = ${PostgresSql.literal(key.name)} AND conrelid = to_regclass(${PostgresSql.literal(table)})) THEN\n`
        + `    ALTER TABLE ${table} ADD CONSTRAINT ${id(key.name)} ${definition};\n  END IF;\nEND $flase$;\n`;
    }
    await write(`${sql}\n`);
  }

  private report(): void {
    this.onProgress({...this.progress, rows: this.rows});
  }

  /** rows by statistics of the server - never analyzed table has reltuples -1 */
  private async estimateRows(schema: string, tables: string[]): Promise<number> {
    if (!tables.length) return 0;
    const {rows: [row]} = await this.client!.query(
      `SELECT COALESCE(SUM(GREATEST(c.reltuples, 0)), 0)::bigint AS rows
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = ANY($2)`,
      [schema, tables],
    );
    return Number(row.rows) || 0;
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

  /**
   * INSERT statements of about 1 MB (or one row), generated columns are left out (they cannot be inserted);
   * upsert / UPDATE need primary key - table without it gets plain INSERT
   */
  private async dumpData(table: string, columns: CatalogColumnInterface[], write: (text: string) => Promise<void>): Promise<void> {
    const dumped = columns.filter((column) => !column.generated);
    if (!dumped.length) return;
    const id = PostgresSql.identifier;
    let mode = this.options.insertMode || 'insert';
    const keys = (this.primaryKeys.get(table) || []).filter((key) => dumped.some((column) => column.name === key));
    let note = '';
    if ((mode === 'upsert' || mode === 'update') && !keys.length) {
      this.withoutPrimaryKey.push(table);
      note = `-- table has no primary key - rows are inserted, not ${mode === 'update' ? 'updated' : 'merged'}\n`;
      mode = 'insert';
    }
    // GENERATED ALWAYS identity cannot be set by UPDATE / DO UPDATE
    const others = dumped.filter((column) => !keys.includes(column.name) && column.identity !== 'a');
    if (mode === 'upsert' && !others.length) mode = 'ignore';
    if (mode === 'update' && !others.length) {
      await write(`--\n-- Data of table ${id(table)}: every column is part of primary key, nothing to update\n--\n\n`);
      return;
    }
    // GENERATED ALWAYS identity accepts own values only with OVERRIDING
    const overriding = dumped.some((column) => column.identity === 'a') ? ' OVERRIDING SYSTEM VALUE' : '';
    const insertStart = `INSERT INTO ${id(table)} (${PostgresSql.identifiers(dumped.map((column) => column.name))})${overriding} VALUES\n`;
    const insertEnd = mode === 'ignore'
      ? '\nON CONFLICT DO NOTHING'
      : mode === 'upsert'
        ? `\nON CONFLICT (${PostgresSql.identifiers(keys)}) DO UPDATE SET ${others.map((column) => `${id(column.name)} = EXCLUDED.${id(column.name)}`).join(', ')}`
        : '';
    const batchLimit = this.options.rowPerInsert ? 1 : INSERT_BATCH_BYTES;
    const cursor = this.client!.query(new Cursor(
      `SELECT ${PostgresSql.identifiers(dumped.map((column) => column.name))} FROM ${PostgresSql.table(this.options.database, table)}`,
      [],
      {types: PostgresSql.types, rowMode: 'array'},
    ));
    const read = (): Promise<any[][]> => new Promise((resolve, reject) => {
      if (this.connectionError) return reject(this.connectionError);
      const lost = (error: Error) => reject(error);
      this.connectionLost.add(lost);
      cursor.read(CURSOR_ROWS, (err: Error | null, rows: any[][]) => {
        this.connectionLost.delete(lost);
        err ? reject(err) : resolve(rows);
      });
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
        await write(`--\n-- Data of table ${id(table)}\n--\n\n${note}`);
        headerWritten = true;
      }
      await write(mode === 'update' ? batch.join('') : `${insertStart}${batch.join(',\n')}${insertEnd};\n`);
      batch = [];
      batchBytes = 0;
      this.report();
    };

    try {
      for (;;) {
        // next rows are read only after previous ones are written - backpressure of the download
        const rows = await read();
        for (const row of rows) {
          const valueOf = (name: string) => {
            const index = dumped.findIndex((column) => column.name === name);
            return literal(row[index], dumped[index]);
          };
          const values = mode === 'update'
            ? `UPDATE ${id(table)} SET ${others.map((column) => `${id(column.name)} = ${valueOf(column.name)}`).join(', ')}`
              + ` WHERE ${keys.map((key) => `${id(key)} = ${valueOf(key)}`).join(' AND ')};\n`
            : `(${row.map((value, index) => literal(value, dumped[index])).join(', ')})`;
          batch.push(values);
          batchBytes += values.length;
          this.rows++;
          if (batchBytes >= batchLimit) {
            await flush();
          }
        }
        if (rows.length < CURSOR_ROWS) break;
      }
    } finally {
      if (!this.connectionError) {
        await new Promise<void>((resolve) => cursor.close(() => resolve()));
      }
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
