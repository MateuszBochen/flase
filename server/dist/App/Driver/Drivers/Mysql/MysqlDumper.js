"use strict";
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const stream_1 = require("stream");
const mysql = require('mysql');
/** one INSERT statement holds about this many bytes of values */
const INSERT_BATCH_BYTES = 1024 * 1024;
/** DEFINER would fail on server where the user does not exist */
const withoutDefiner = (sql) => sql.replace(/\s+DEFINER\s*=\s*(`[^`]*`|'[^']*'|\S+)@(`[^`]*`|'[^']*'|\S+)/i, '');
/**
 * SQL dump of database / tables, written as stream (data are never kept in memory).
 * Tables are read in one transaction with consistent snapshot.
 * @author Mateusz Bochen
 */
class MysqlDumper {
    constructor(pool, options) {
        this.pool = pool;
        this.options = options;
        this.connection = null;
        this.tables = 0;
        this.rows = 0;
    }
    async dump(write) {
        this.connection = await new Promise((resolve, reject) => {
            this.pool.getConnection((err, connection) => err ? reject(err) : resolve(connection));
        });
        try {
            const { database } = this.options;
            // the same values on any server: dates are dumped as stored, TIMESTAMP in UTC
            await this.query("SET SESSION time_zone = '+00:00'");
            await this.query('SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ');
            await this.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
            const objects = (await this.query('SELECT `TABLE_NAME`, `TABLE_TYPE` FROM `information_schema`.`TABLES` WHERE `TABLE_SCHEMA` = ? ORDER BY `TABLE_NAME`', [database])).filter((row) => !this.options.tables.length || this.options.tables.includes(row.TABLE_NAME));
            const tables = objects.filter((row) => row.TABLE_TYPE === 'BASE TABLE').map((row) => row.TABLE_NAME);
            const views = objects.filter((row) => /VIEW/.test(row.TABLE_TYPE)).map((row) => row.TABLE_NAME);
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
                const triggers = await this.query('SELECT `TRIGGER_NAME`, `EVENT_OBJECT_TABLE` FROM `information_schema`.`TRIGGERS` WHERE `TRIGGER_SCHEMA` = ? ORDER BY `EVENT_OBJECT_TABLE`, `ACTION_ORDER`', [database]);
                for (const trigger of triggers.filter((row) => tables.includes(row.EVENT_OBJECT_TABLE))) {
                    const [create] = await this.query('SHOW CREATE TRIGGER ??.??', [database, trigger.TRIGGER_NAME]);
                    await write(`--\n-- Trigger ${mysql.escapeId(trigger.TRIGGER_NAME)}\n--\n\n`
                        + (this.options.dropTables ? `DROP TRIGGER IF EXISTS ${mysql.escapeId(trigger.TRIGGER_NAME)};\n` : '')
                        + `DELIMITER ;;\n${withoutDefiner(create['SQL Original Statement'])};;\nDELIMITER ;\n\n`);
                }
            }
            await write('SET FOREIGN_KEY_CHECKS = 1;\n');
            await this.query('COMMIT');
            return { tables: this.tables, rows: this.rows };
        }
        finally {
            this.connection.release();
            this.connection = null;
        }
    }
    /** INSERT statements of about 1 MB, generated columns are left out (they cannot be inserted) */
    async dumpData(table, write) {
        var e_1, _a;
        const columns = (await this.query('SELECT `COLUMN_NAME`, `GENERATION_EXPRESSION` FROM `information_schema`.`COLUMNS` WHERE `TABLE_SCHEMA` = ? AND `TABLE_NAME` = ? ORDER BY `ORDINAL_POSITION`', [this.options.database, table])).filter((row) => !row.GENERATION_EXPRESSION).map((row) => row.COLUMN_NAME);
        if (!columns.length)
            return;
        const insertStart = `INSERT INTO ${mysql.escapeId(table)} (${columns.map((column) => mysql.escapeId(column)).join(', ')}) VALUES\n`;
        // stream of mysql package (readable-stream 2) cannot be iterated - native stream can, backpressure is kept by pipe
        const stream = this.connection.query(mysql.format(`SELECT ?? FROM ??.??`, [columns, this.options.database, table]))
            .stream({ highWaterMark: 100 })
            .pipe(new stream_1.PassThrough({ objectMode: true, highWaterMark: 100 }));
        let batch = [];
        let batchBytes = 0;
        let headerWritten = false;
        const flush = async () => {
            if (!batch.length)
                return;
            if (!headerWritten) {
                await write(`--\n-- Data of table ${mysql.escapeId(table)}\n--\n\n`);
                headerWritten = true;
            }
            await write(`${insertStart}${batch.join(',\n')};\n`);
            batch = [];
            batchBytes = 0;
        };
        try {
            // async iteration reads next rows only after previous ones are written - backpressure of the download
            for (var _b = __asyncValues(stream), _c; _c = await _b.next(), !_c.done;) {
                const row = _c.value;
                // Buffer -> X'..', dates are strings (dateStrings), numbers keep precision (bigNumberStrings)
                const values = `(${columns.map((column) => mysql.escape(row[column])).join(', ')})`;
                batch.push(values);
                batchBytes += values.length;
                this.rows++;
                if (batchBytes >= INSERT_BATCH_BYTES) {
                    await flush();
                }
            }
        }
        catch (e_1_1) { e_1 = { error: e_1_1 }; }
        finally {
            try {
                if (_c && !_c.done && (_a = _b.return)) await _a.call(_b);
            }
            finally { if (e_1) throw e_1.error; }
        }
        await flush();
        if (headerWritten) {
            await write('\n');
        }
    }
    query(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.connection.query(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
        });
    }
}
exports.default = MysqlDumper;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTXlzcWxEdW1wZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi9zcmMvQXBwL0RyaXZlci9Ecml2ZXJzL015c3FsL015c3FsRHVtcGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7OztBQUNBLG1DQUFtQztBQUVuQyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7QUFFL0IsaUVBQWlFO0FBQ2pFLE1BQU0sa0JBQWtCLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUV2QyxpRUFBaUU7QUFDakUsTUFBTSxjQUFjLEdBQUcsQ0FBQyxHQUFXLEVBQUUsRUFBRSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsK0RBQStELEVBQUUsRUFBRSxDQUFDLENBQUM7QUFFekg7Ozs7R0FJRztBQUNILE1BQU0sV0FBVztJQUtmLFlBQTZCLElBQVUsRUFBbUIsT0FBNkI7UUFBMUQsU0FBSSxHQUFKLElBQUksQ0FBTTtRQUFtQixZQUFPLEdBQVAsT0FBTyxDQUFzQjtRQUovRSxlQUFVLEdBQTBCLElBQUksQ0FBQztRQUN6QyxXQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQ1gsU0FBSSxHQUFHLENBQUMsQ0FBQztJQUdqQixDQUFDO0lBRUQsS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFzQztRQUMvQyxJQUFJLENBQUMsVUFBVSxHQUFHLE1BQU0sSUFBSSxPQUFPLENBQWlCLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ3RFLElBQUksQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLENBQUMsR0FBRyxFQUFFLFVBQVUsRUFBRSxFQUFFLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO1FBQ3hGLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSTtZQUNGLE1BQU0sRUFBQyxRQUFRLEVBQUMsR0FB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