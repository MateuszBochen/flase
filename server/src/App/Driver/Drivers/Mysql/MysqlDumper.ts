import {Pool, PoolConnection} from 'mysql';
import {PassThrough} from 'stream';
import {DumpOptionsInterface} from '../../Interface/Data/TransferInterface';
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

  constructor(private readonly pool: Pool, private readonly options: DumpOptionsInterface) {
  }

  async dump(write: (text: string) => Promise<void>): Promise<{tables: number, rows: number}> {
    this.connection = await new Promise<PoolConnection>((resolve, reject) => {
      this.pool.getConnection((err, connection) => err ? reject(err) : resolve(connection));
    });

    try {
      const {database} = this.options;
      // the same values on any server: dates are dumped as stored, TIMESTAMP in UTC
      await this.query("SET SESSION time_zone = '+00:00'");
      await this.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await this.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');

      const objects = (await this.query(
        'SELECT `TABLE_NAME`, `TABLE_TYPE` FROM `information_schema`.`TABLES` WHERE `TABLE_SCHEMA` = ? ORDER BY `TABLE_NAME`',
        [database],
      )).filter((row: any) => !this.options.tables.length || this.options.tables.includes(row.TABLE_NAME));
      const tables = objects.filter((row: any) => row.TABLE_TYPE === 'BASE TABLE').map((row: any) => row.TABLE_NAME as string);
      const views = objects.filter((row: any) => /VIEW/.test(row.TABLE_TYPE)).map((row: any) => row.TABLE_NAME as string);

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
        if (this.options.structure) {
          const [create] = await this.query('SHOW CREATE TABLE ??.??', [database, table]);
          await write(`--\n-- Structure of table ${mysql.escapeId(table)}\n--\n\n`
            + (this.options.dropTables ? `DROP TABLE IF EXISTS ${mysql.escapeId(table)};\n` : '')
            + `${create['Create Table']};\n\n`);
        }
        if (this.options.data) {
          await this.dumpData(table, write);
        }
      }

      if (this.options.structure && this.options.views) {
        for (const view of views) {
          const [create] = await this.query('SHOW CREATE VIEW ??.??', [database, view]);
          await write(`--\n-- View ${mysql.escapeId(view)}\n--\n\n`
            + (this.options.dropTables ? `DROP VIEW IF EXISTS ${mysql.escapeId(view)};\n` : '')
            + `${withoutDefiner(create['Create View'])};\n\n`);
        }
      }

      if (this.options.structure && this.options.triggers && tables.length) {
        const triggers = await this.query(
          'SELECT `TRIGGER_NAME`, `EVENT_OBJECT_TABLE` FROM `information_schema`.`TRIGGERS` WHERE `TRIGGER_SCHEMA` = ? ORDER BY `EVENT_OBJECT_TABLE`, `ACTION_ORDER`',
          [database],
        );
        for (const trigger of triggers.filter((row: any) => tables.includes(row.EVENT_OBJECT_TABLE))) {
          const [create] = await this.query('SHOW CREATE TRIGGER ??.??', [database, trigger.TRIGGER_NAME]);
          await write(`--\n-- Trigger ${mysql.escapeId(trigger.TRIGGER_NAME)}\n--\n\n`
            + (this.options.dropTables ? `DROP TRIGGER IF EXISTS ${mysql.escapeId(trigger.TRIGGER_NAME)};\n` : '')
            + `DELIMITER ;;\n${withoutDefiner(create['SQL Original Statement'])};;\nDELIMITER ;\n\n`);
        }
      }

      await write('SET FOREIGN_KEY_CHECKS = 1;\n');
      await this.query('COMMIT');
      return {tables: this.tables, rows: this.rows};
    } finally {
      this.connection.release();
      this.connection = null;
    }
  }

  /** INSERT statements of about 1 MB, generated columns are left out (they cannot be inserted) */
  private async dumpData(table: string, write: (text: string) => Promise<void>): Promise<void> {
    const columns = (await this.query(
      'SELECT `COLUMN_NAME`, `GENERATION_EXPRESSION` FROM `information_schema`.`COLUMNS` WHERE `TABLE_SCHEMA` = ? AND `TABLE_NAME` = ? ORDER BY `ORDINAL_POSITION`',
      [this.options.database, table],
    // only VIRTUAL / STORED columns - EXTRA "DEFAULT_GENERATED" of MySQL means expression default, the value must be dumped
    )).filter((row: any) => !row.GENERATION_EXPRESSION).map((row: any) => row.COLUMN_NAME as string);
    if (!columns.length) return;

    const insertStart = `INSERT INTO ${mysql.escapeId(table)} (${columns.map((column) => mysql.escapeId(column)).join(', ')}) VALUES\n`;
    // stream of mysql package (readable-stream 2) cannot be iterated - native stream can, backpressure is kept by pipe
    const stream = this.connection!.query(mysql.format(`SELECT ?? FROM ??.??`, [columns, this.options.database, table]))
      .stream({highWaterMark: 100})
      .pipe(new PassThrough({objectMode: true, highWaterMark: 100}));

    let batch: string[] = [];
    let batchBytes = 0;
    let headerWritten = false;
    const flush = async () => {
      if (!batch.length) return;
      if (!headerWritten) {
        await write(`--\n-- Data of table ${mysql.escapeId(table)}\n--\n\n`);
        headerWritten = true;
      }
      await write(`${insertStart}${batch.join(',\n')};\n`);
      batch = [];
      batchBytes = 0;
    };

    // async iteration reads next rows only after previous ones are written - backpressure of the download
    for await (const row of stream as any) {
      // Buffer -> X'..', dates are strings (dateStrings), numbers keep precision (bigNumberStrings)
      const values = `(${columns.map((column) => mysql.escape(row[column])).join(', ')})`;
      batch.push(values);
      batchBytes += values.length;
      this.rows++;
      if (batchBytes >= INSERT_BATCH_BYTES) {
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
