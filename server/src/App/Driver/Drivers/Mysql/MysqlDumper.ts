import {Pool, PoolConnection} from 'mysql';
import {PassThrough} from 'stream';
import {DumpOptionsInterface} from '../../Interface/Data/TransferInterface';
import {dumpPartsOf, DumpProgressCallbackType, DumpProgressType} from '../../../Transfer/DumpParts';
const mysql = require('mysql');

/** one INSERT statement holds about this many bytes of values */
const INSERT_BATCH_BYTES = 1024 * 1024;

/** DEFINER would fail on server where the user does not exist */
const withoutDefiner = (sql: string) => sql.replace(/\s+DEFINER\s*=\s*(`[^`]*`|'[^']*'|\S+)@(`[^`]*`|'[^']*'|\S+)/i, '');

/**
 * SQL dump of database / tables, written as stream (data are never kept in memory).
 * Tables are read in one transaction with consistent snapshot.
 * @author Mateusz Bochen
 */
class MysqlDumper {
  private connection: PoolConnection | null = null;
  private tables = 0;
  private rows = 0;
  private readonly progress: DumpProgressType = {table: null, tablesDone: 0, tablesTotal: 0, rows: 0, estimatedRows: 0};
  /** primary key columns of tables - upsert / UPDATE of data */
  private primaryKeys = new Map<string, string[]>();
  private readonly withoutPrimaryKey: string[] = [];

  constructor(private readonly pool: Pool, private readonly options: DumpOptionsInterface,
              private readonly onProgress: DumpProgressCallbackType = () => undefined) {
  }

  async dump(write: (text: string) => Promise<void>): Promise<{tables: number, rows: number, withoutPrimaryKey: string[]}> {
    this.connection = await new Promise<PoolConnection>((resolve, reject) => {
      this.pool.getConnection((err, connection) => err ? reject(err) : resolve(connection));
    });

    let completed = false;
    try {
      const {database} = this.options;
      // the same values on any server: dates are dumped as stored, TIMESTAMP in UTC
      await this.query("SET SESSION time_zone = '+00:00'");
      // browser which stops reading for a while (slow disk, sleep of computer, full buffer of proxy) pauses the rows -
      // server would close the connection after net_write_timeout (60 s), the dump of big table would be broken
      await this.query('SET SESSION net_write_timeout = 86400').catch(() => undefined);
      await this.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await this.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');

      // nothing is written yet - missing database or table is reported as error, not as empty dump
      if (!(await this.query('SELECT 1 FROM `information_schema`.`SCHEMATA` WHERE `SCHEMA_NAME` = ?', [database])).length) {
        throw new Error(`Database ${database} does not exist`);
      }
      // SHOW CREATE VIEW names objects of other than current database with the database - dump imported into other
      // database (copy) would create views in this one and read its tables
      await this.query('USE ??', [database]);
      const allObjects = await this.query(
        'SELECT `TABLE_NAME`, `TABLE_TYPE`, `TABLE_ROWS` FROM `information_schema`.`TABLES` WHERE `TABLE_SCHEMA` = ? ORDER BY `TABLE_NAME`',
        [database],
      );
      const missing = this.options.tables.filter((table) => !allObjects.some((row: any) => row.TABLE_NAME === table));
      if (missing.length) {
        throw new Error(`Tables do not exist: ${missing.join(', ')}`);
      }
      const objects = allObjects.filter((row: any) => !this.options.tables.length || this.options.tables.includes(row.TABLE_NAME));
      const tables = objects.filter((row: any) => row.TABLE_TYPE === 'BASE TABLE').map((row: any) => row.TABLE_NAME as string);
      const views = objects.filter((row: any) => /VIEW/.test(row.TABLE_TYPE)).map((row: any) => row.TABLE_NAME as string)
        .filter((view: string) => dumpPartsOf(this.options, view).structure);
      const parts = (table: string) => dumpPartsOf(this.options, table);
      this.progress.tablesTotal = tables.length;
      this.progress.estimatedRows = objects
        .filter((row: any) => row.TABLE_TYPE === 'BASE TABLE' && parts(row.TABLE_NAME).data)
        .reduce((sum: number, row: any) => sum + (Number(row.TABLE_ROWS) || 0), 0);
      this.report();
      if (['upsert', 'update'].includes(this.options.insertMode || '')) {
        const keys = await this.query(
          "SELECT `TABLE_NAME`, `COLUMN_NAME` FROM `information_schema`.`KEY_COLUMN_USAGE` WHERE `TABLE_SCHEMA` = ? AND `CONSTRAINT_NAME` = 'PRIMARY' ORDER BY `TABLE_NAME`, `ORDINAL_POSITION`",
          [database],
        );
        keys.forEach((row: any) => this.primaryKeys.set(row.TABLE_NAME, [...(this.primaryKeys.get(row.TABLE_NAME) || []), row.COLUMN_NAME]));
      }

      const [server] = await this.query('SELECT VERSION() AS `version`, @@hostname AS `host`');
      await write([
        '-- Flase SQL dump',
        `-- Server: ${server.version}  Host: ${server.host}`,
        `-- Database: ${database}`,
        `-- Generated: ${new Date().toISOString()}`,
        '',
        'SET NAMES utf8mb4;',
        "SET time_zone = '+00:00';",
        'SET FOREIGN_KEY_CHECKS = 0;',
        "SET SQL_MODE = 'NO_AUTO_VALUE_ON_ZERO';",
        '',
      ].join('\n') + '\n');

      if (this.options.createDatabase) {
        const [create] = await this.query('SHOW CREATE DATABASE ??', [database]);
        await write(`${create['Create Database'].replace(/^CREATE DATABASE/i, 'CREATE DATABASE IF NOT EXISTS')};\nUSE ${mysql.escapeId(database)};\n\n`);
      }

      for (const table of tables) {
        this.tables++;
        this.progress.table = table;
        this.report();
        if (parts(table).structure) {
          const [create] = await this.query('SHOW CREATE TABLE ??.??', [database, table]);
          await write(`--\n-- Structure of table ${mysql.escapeId(table)}\n--\n\n`
            + (this.options.dropTables ? `DROP TABLE IF EXISTS ${mysql.escapeId(table)};\n` : '')
            + `${create['Create Table']};\n\n`);
        }
        if (parts(table).data) {
          if (this.options.truncateData && !parts(table).structure && this.options.insertMode !== 'update') {
            await write(`TRUNCATE TABLE ${mysql.escapeId(table)};\n`);
          }
          await this.dumpData(table, write);
        }
        this.progress.tablesDone++;
      }
      this.progress.table = null;
      this.report();

      if (this.options.views) {
        const definitions = new Map<string, string>();
        for (const view of views) {
          const [create] = await this.query('SHOW CREATE VIEW ??', [view]);
          definitions.set(view, withoutDefiner(create['Create View']));
        }
        for (const view of MysqlDumper.orderViews(definitions)) {
          await write(`--\n-- View ${mysql.escapeId(view)}\n--\n\n`
            + (this.options.dropTables ? `DROP VIEW IF EXISTS ${mysql.escapeId(view)};\n` : '')
            + `${definitions.get(view)};\n\n`);
        }
      }

      const structureTables = tables.filter((table: string) => parts(table).structure);
      if (this.options.triggers && structureTables.length) {
        const triggers = await this.query(
          'SELECT `TRIGGER_NAME`, `EVENT_OBJECT_TABLE` FROM `information_schema`.`TRIGGERS` WHERE `TRIGGER_SCHEMA` = ? ORDER BY `EVENT_OBJECT_TABLE`, `ACTION_ORDER`',
          [database],
        );
        for (const trigger of triggers.filter((row: any) => structureTables.includes(row.EVENT_OBJECT_TABLE))) {
          const [create] = await this.query('SHOW CREATE TRIGGER ??.??', [database, trigger.TRIGGER_NAME]);
          await write(`--\n-- Trigger ${mysql.escapeId(trigger.TRIGGER_NAME)}\n--\n\n`
            + (this.options.dropTables ? `DROP TRIGGER IF EXISTS ${mysql.escapeId(trigger.TRIGGER_NAME)};\n` : '')
            + `DELIMITER ;;\n${withoutDefiner(create['SQL Original Statement'])};;\nDELIMITER ;\n\n`);
        }
      }

      await write('SET FOREIGN_KEY_CHECKS = 1;\n');
      await this.query('COMMIT');
      completed = true;
      return {tables: this.tables, rows: this.rows, withoutPrimaryKey: this.withoutPrimaryKey};
    } finally {
      // stopped dump may leave a paused SELECT stream - such connection must not go back to the pool
      completed ? this.connection.release() : this.connection.destroy();
      this.connection = null;
    }
  }

  /**
   * views used by other views first - view named in definition of other one (`name` after USE of the database)
   * is created before it; names in cycle (or false match of column name) keep alphabetical order
   */
  private static orderViews(definitions: Map<string, string>): string[] {
    const names = Array.from(definitions.keys());
    const uses = new Map(names.map((name) => {
      const body = (definitions.get(name) || '').replace(/^[\s\S]*?\sAS\s/i, '');
      return [name, names.filter((other) => other !== name && body.includes(mysql.escapeId(other)))];
    }));
    const ordered: string[] = [];
    const visiting = new Set<string>();
    const visit = (name: string) => {
      if (ordered.includes(name) || visiting.has(name)) return;
      visiting.add(name);
      (uses.get(name) || []).forEach(visit);
      visiting.delete(name);
      ordered.push(name);
    };
    names.forEach(visit);
    return ordered;
  }

  private report(): void {
    this.onProgress({...this.progress, rows: this.rows});
  }

  /**
   * INSERT statements of about 1 MB (or one row), generated columns are left out (they cannot be inserted);
   * upsert / UPDATE need primary key - table without it gets plain INSERT
   */
  private async dumpData(table: string, write: (text: string) => Promise<void>): Promise<void> {
    const columns = (await this.query(
      'SELECT `COLUMN_NAME`, `GENERATION_EXPRESSION` FROM `information_schema`.`COLUMNS` WHERE `TABLE_SCHEMA` = ? AND `TABLE_NAME` = ? ORDER BY `ORDINAL_POSITION`',
      [this.options.database, table],
    // only VIRTUAL / STORED columns - EXTRA "DEFAULT_GENERATED" of MySQL means expression default, the value must be dumped
    )).filter((row: any) => !row.GENERATION_EXPRESSION).map((row: any) => row.COLUMN_NAME as string);
    if (!columns.length) return;

    const id = (name: string) => mysql.escapeId(name);
    let mode = this.options.insertMode || 'insert';
    const keys = (this.primaryKeys.get(table) || []).filter((key) => columns.includes(key));
    let note = '';
    if ((mode === 'upsert' || mode === 'update') && !keys.length) {
      this.withoutPrimaryKey.push(table);
      note = `-- table has no primary key - rows are inserted, not ${mode === 'update' ? 'updated' : 'merged'}\n`;
      mode = 'insert';
    }
    const others = columns.filter((column) => !keys.includes(column));
    // every column is part of the key - existing row has nothing to change
    if (mode === 'upsert' && !others.length) mode = 'ignore';
    if (mode === 'update' && !others.length) {
      await write(`--\n-- Data of table ${id(table)}: every column is part of primary key, nothing to update\n--\n\n`);
      return;
    }
    const insertStart = `INSERT${mode === 'ignore' ? ' IGNORE' : ''} INTO ${id(table)} (${columns.map(id).join(', ')}) VALUES\n`;
    const insertEnd = mode === 'upsert' ? `\nON DUPLICATE KEY UPDATE ${others.map((column) => `${id(column)} = VALUES(${id(column)})`).join(', ')}` : '';
    const batchLimit = this.options.rowPerInsert ? 1 : INSERT_BATCH_BYTES;
    const statementOf = (row: any): string => mode === 'update'
      ? `UPDATE ${id(table)} SET ${others.map((column) => `${id(column)} = ${mysql.escape(row[column])}`).join(', ')}`
        + ` WHERE ${keys.map((key) => `${id(key)} = ${mysql.escape(row[key])}`).join(' AND ')};\n`
      // Buffer -> X'..', dates are strings (dateStrings), numbers keep precision (bigNumberStrings)
      : `(${columns.map((column) => mysql.escape(row[column])).join(', ')})`;
    // stream of mysql package (readable-stream 2) cannot be iterated - native stream can, backpressure is kept by pipe
    const source = this.connection!.query(mysql.format(`SELECT ?? FROM ??.??`, [columns, this.options.database, table]))
      .stream({highWaterMark: 100});
    const stream = new PassThrough({objectMode: true, highWaterMark: 100});
    // pipe does not pass errors - failed SELECT (table changed, connection lost) would be unhandled and stop the server
    source.on('error', (error: Error) => stream.destroy(error));
    source.pipe(stream);

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

    // async iteration reads next rows only after previous ones are written - backpressure of the download
    for await (const row of stream as any) {
      const values = statementOf(row);
      batch.push(values);
      batchBytes += values.length;
      this.rows++;
      if (batchBytes >= batchLimit) {
        await flush();
      }
    }
    await flush();
    if (headerWritten) {
      await write('\n');
    }
  }

  private query(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.connection!.query(sql, params, (err: any, rows: any) => err ? reject(err) : resolve(rows));
    });
  }
}

export default MysqlDumper;
