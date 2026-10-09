"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const rxjs_1 = require("rxjs");
const MysqlSession_1 = __importDefault(require("./MysqlSession"));
const MysqlDdlBuilder_1 = __importDefault(require("./MysqlDdlBuilder"));
const MysqlDumper_1 = __importDefault(require("./MysqlDumper"));
const SelectAnalyser_1 = __importDefault(require("../../Query/SelectAnalyser"));
const MysqlUsers_1 = __importDefault(require("./MysqlUsers"));
const BinaryValue_1 = require("../BinaryValue");
const mysql = require('mysql');
const { Parser } = require('node-sql-parser');
class MysqlAdapter {
    constructor(connectionData, dsnOptions) {
        this.dialect = 'mysql';
        this.consoleLog = true;
        this.pool = null;
        /** credentials were verified and disconnect was not called */
        this.connected = false;
        this.keepaliveIntervalId = null;
        /** sessions running for tabs - cancel kills their query */
        this.runningSessions = new Map();
        this.mariaDb = null;
        this.streamQueryResults = (query) => {
            this.log(`Query Stream: ${query}`);
            return new rxjs_1.Observable(observer => {
                this.getPool().query(query)
                    .on('error', (error) => observer.error(error))
                    .on('result', (row) => observer.next(row))
                    // 'end' is emitted also after error - complete is then ignored by rxjs
                    .on('end', () => observer.complete());
            });
        };
        this.preparePrimaryColumns = (columnsOfTable, records) => {
            return columnsOfTable.filter((tableColumn) => records.some((record) => {
                return record.Column_name === tableColumn.name && record.Key_name === 'PRIMARY';
            }));
        };
        this.keepalive = () => {
            // released pool is not opened just for keepalive
            if (!this.pool) {
                return;
            }
            try {
                this.pool.query('SELECT 1 + 1 AS solution', (err) => {
                    if (err) {
                        console.log(err.code); // 'ER_BAD_DB_ERROR'
                    }
                });
            }
            catch (e) {
                console.log(e);
            }
        };
        this.connectionData = connectionData;
        this.parser = new Parser();
        this.analyser = new SelectAnalyser_1.default(this.parser, this.dialect);
        this.dsnOptions = dsnOptions;
    }
    connect() {
        const pool = this.createPool();
        // check credentials with first connection
        return new Promise((resolve, reject) => {
            pool.getConnection((err, connection) => {
                if (err) {
                    this.log(err);
                    pool.end();
                    reject(err);
                    return;
                }
                connection.release();
                this.pool = pool;
                this.connected = true;
                this.keepaliveIntervalId = setInterval(this.keepalive, 1000 * 60 * 5);
                resolve(this);
            });
        });
    }
    users() {
        return new MysqlUsers_1.default((sql, params) => this.queryRows(sql, params));
    }
    disconnect() {
        this.connected = false;
        if (this.keepaliveIntervalId) {
            clearInterval(this.keepaliveIntervalId);
            this.keepaliveIntervalId = null;
        }
        this.releaseConnections();
    }
    releaseConnections() {
        if (this.pool) {
            this.pool.end((err) => err && this.log(err));
            this.pool = null;
        }
    }
    createPool() {
        return mysql.createPool({
            host: this.dsnOptions.host,
            // undefined falls back to the driver default (3306)
            port: this.dsnOptions.port,
            user: this.connectionData.userData.username,
            password: this.connectionData.userData.password,
            insecureAuth: true,
            multipleStatements: true,
            connectionLimit: 5,
            // values must stay as they are in database - dates without timezone shift, big numbers without rounding
            dateStrings: true,
            supportBigNumbers: true,
            bigNumberStrings: true,
        });
    }
    openSession(database, tabId) {
        return new Promise((resolve, reject) => {
            this.getPool().getConnection((err, connection) => {
                if (err) {
                    reject(err);
                    return;
                }
                const createSession = () => {
                    const session = new MysqlSession_1.default(connection, this.analyser, tabId ? () => {
                        if (this.runningSessions.get(tabId) === session) {
                            this.runningSessions.delete(tabId);
                        }
                    } : undefined);
                    if (tabId) {
                        this.runningSessions.set(tabId, session);
                    }
                    return session;
                };
                const done = (useErr) => {
                    if (useErr) {
                        connection.release();
                        reject(useErr);
                        return;
                    }
                    resolve(createSession());
                };
                // pooled connection keeps database, SET variables (sql_mode, FOREIGN_KEY_CHECKS, @x) and temporary tables
                // of previous session - every session starts with clean connection
                connection.changeUser({}, (resetErr) => {
                    if (resetErr || !database) {
                        done(resetErr);
                        return;
                    }
                    connection.query('USE ??', [database], done);
                });
            });
        });
    }
    async cancel(tabId) {
        const session = this.runningSessions.get(tabId);
        const threadId = session === null || session === void 0 ? void 0 : session.threadId;
        if (!session || !threadId) {
            return false;
        }
        // import checks it between statements, KILL stops the running one
        session.markCancelled();
        // must run on other connection - the session connection is busy with the query
        await this.queryRows('KILL QUERY ?', [threadId]);
        return true;
    }
    async getProcessList() {
        var _a;
        const ownThreads = new Set((((_a = this.pool) === null || _a === void 0 ? void 0 : _a._allConnections) || []).map((connection) => connection.threadId));
        const rows = await this.queryRows('SHOW FULL PROCESSLIST');
        return rows.map((row) => ({
            id: Number(row.Id),
            user: row.User,
            host: row.Host,
            db: row.db,
            command: row.Command,
            time: Number(row.Time),
            state: row.State || null,
            info: row.Info,
            own: ownThreads.has(Number(row.Id)),
        }));
    }
    dump(options, write) {
        return new MysqlDumper_1.default(this.getPool(), options).dump(write);
    }
    buildInsertStatement(database, table, columns, rows) {
        return mysql.format('INSERT INTO ??.?? (??) VALUES ?', [database, table, columns, rows]);
    }
    async killProcess(id, connection) {
        if (!Number.isInteger(id) || id <= 0) {
            throw new Error('Invalid process id');
        }
        await this.queryRows(connection ? 'KILL CONNECTION ?' : 'KILL QUERY ?', [id]);
    }
    getListOfDatabases() {
        const query = 'SHOW DATABASES';
        return new rxjs_1.Observable(observer => {
            this.streamQueryResults(query).subscribe({
                next: (record) => observer.next({ name: `${record.Database}` }),
                error: (error) => observer.error(error),
                complete: () => observer.complete(),
            });
        });
    }
    getListOfTablesInDatabase(databaseName) {
        const showTablesQuery = mysql.format('SHOW TABLES FROM ??', [databaseName]);
        this.log('Show tables');
        return new rxjs_1.Observable(observer => {
            // tables still waiting for keys and columns
            let pending = 0;
            let allTablesListed = false;
            const completeIfDone = () => {
                if (allTablesListed && pending === 0) {
                    observer.complete();
                }
            };
            this.streamQueryResults(showTablesQuery).subscribe({
                next: (record) => {
                    Object.values(record).forEach((value) => {
                        const tableName = `${value}`;
                        const showKeysFromTableQuery = mysql.format('SHOW KEYS FROM ??.??', [databaseName, tableName]);
                        pending++;
                        // send empty object to short loading
                        observer.next({
                            tableName: tableName,
                            columns: [],
                            preload: true,
                            dataBaseName: databaseName,
                            primaryColumns: [],
                            uniqueColumns: [],
                        });
                        this.getPool().query(showKeysFromTableQuery, (err, keysRecords) => {
                            if (err) {
                                observer.error(err);
                                return;
                            }
                            this.getColumnsOfTable(databaseName, { table: tableName }).then((columnsOfTable) => {
                                observer.next({
                                    tableName: tableName,
                                    columns: columnsOfTable,
                                    preload: false,
                                    dataBaseName: databaseName,
                                    primaryColumns: this.preparePrimaryColumns(columnsOfTable, keysRecords),
                                    uniqueColumns: [],
                                });
                                pending--;
                                completeIfDone();
                            }).catch((error) => observer.error(error));
                        });
                    });
                },
                error: (error) => observer.error(error),
                complete: () => {
                    allTablesListed = true;
                    completeIfDone();
                },
            });
        });
    }
    getSelectFromTypeFromQuery(query) {
        return this.analyser.getFrom(query);
    }
    getColumnsOfTable(databaseName, selectFromType) {
        const showColumnsQuery = mysql.format('SHOW COLUMNS FROM ??.??', [databaseName, selectFromType.table]);
        return new Promise((resolve, reject) => {
            this.getPool().query(showColumnsQuery, (err, columns) => {
                if (err) {
                    reject(err);
                    return;
                }
                this.getReferencesColumns(databaseName, selectFromType.table).then((referencesResult) => {
                    const newColumns = [];
                    columns.forEach((column) => {
                        const reference = this.findReference(column.Field, referencesResult);
                        const type = `${column.Type}`;
                        const columnType = {
                            table: { databaseName, name: selectFromType.table, alias: selectFromType.as },
                            autoIncrement: column.Extra === 'auto_increment',
                            defaultValue: column.Default,
                            name: column.Field,
                            key: column.Field,
                            orgName: column.Field,
                            type,
                            enumValues: MysqlAdapter.parseEnumValues(type),
                            editable: MysqlAdapter.isEditableType(type) && !/\b(VIRTUAL|STORED) GENERATED\b/i.test(column.Extra || ''),
                            nullable: column.Null === 'YES',
                            primaryKey: column.Key === 'PRI',
                            reference,
                        };
                        newColumns.push(columnType);
                    });
                    resolve(newColumns);
                }).catch(reject);
            });
        });
    }
    getEditableTableOfQuery(query) {
        return this.analyser.getEditableTable(query);
    }
    buildRowChangeStatements(table, changes) {
        return changes.map((change) => {
            const limit = change.limitOne ? ' LIMIT 1' : '';
            switch (change.kind) {
                case 'update':
                    if (!change.values || !Object.keys(change.values).length) {
                        throw new Error('Update without values');
                    }
                    return {
                        sql: mysql.format('UPDATE ??.?? SET ? WHERE ', [table.databaseName, table.name, change.values])
                            + MysqlAdapter.buildWhere(change.where) + limit,
                        expectOneRow: true,
                    };
                case 'delete':
                    return {
                        sql: mysql.format('DELETE FROM ??.?? WHERE ', [table.databaseName, table.name])
                            + MysqlAdapter.buildWhere(change.where) + limit,
                        expectOneRow: true,
                    };
                case 'insert': {
                    const values = change.values || {};
                    const columns = Object.keys(values);
                    return {
                        sql: columns.length
                            ? mysql.format('INSERT INTO ??.?? (??) VALUES (?)', [table.databaseName, table.name, columns, columns.map((column) => values[column])])
                            : mysql.format('INSERT INTO ??.?? () VALUES ()', [table.databaseName, table.name]),
                        expectOneRow: false,
                    };
                }
                default:
                    throw new Error(`Unknown change ${change.kind}`);
            }
        });
    }
    async getTableStructure(table) {
        const warnings = [];
        const db = table.databaseName;
        const name = table.name;
        // missing privileges for one part must not hide the rest
        const load = (part, loader, fallback) => loader.catch((e) => {
            warnings.push(`${part}: ${(e === null || e === void 0 ? void 0 : e.sqlMessage) || (e === null || e === void 0 ? void 0 : e.message) || e}`);
            return fallback;
        });
        const info = await load('Table information', this.loadTableInfo(db, name), null);
        if (!info) {
            throw new Error(`Table ${db}.${name} does not exist`);
        }
        const isView = /VIEW/i.test(info.type);
        const [columns, indexes, foreignKeys, referencedBy, triggers, ddl] = await Promise.all([
            load('Columns', this.loadStructureColumns(db, name), []),
            isView ? Promise.resolve([]) : load('Indexes', this.loadIndexes(db, name), []),
            isView ? Promise.resolve([]) : load('Foreign keys', this.loadForeignKeys('k.`TABLE_SCHEMA` = ? AND k.`TABLE_NAME` = ?', db, name), []),
            isView ? Promise.resolve([]) : load('Referenced by', this.loadForeignKeys('k.`REFERENCED_TABLE_SCHEMA` = ? AND k.`REFERENCED_TABLE_NAME` = ?', db, name), []),
            isView ? Promise.resolve([]) : load('Triggers', this.loadTriggers(db, name), []),
            load('DDL', this.loadDdl(db, name), ''),
        ]);
        return { table: { databaseName: db, name }, info, columns, indexes, foreignKeys, referencedBy, triggers, ddl, warnings };
    }
    async buildStructureChangeStatements(table, change) {
        // generated columns cannot be inserted - copy only real columns
        const copyColumns = change.kind === 'copy' && change.withData
            ? (await this.loadStructureColumns(table.databaseName, table.name))
                .filter((column) => !column.generationExpression)
                .map((column) => column.name)
            : undefined;
        return MysqlDdlBuilder_1.default.build(table, change, copyColumns);
    }
    async searchDatabase(database, term, mode, onResult) {
        // binary and spatial columns are not searched as text
        const columns = await this.queryRows(`SELECT c.\`TABLE_NAME\`, c.\`COLUMN_NAME\`, c.\`DATA_TYPE\`
       FROM \`information_schema\`.\`COLUMNS\` c
       JOIN \`information_schema\`.\`TABLES\` t ON t.\`TABLE_SCHEMA\` = c.\`TABLE_SCHEMA\` AND t.\`TABLE_NAME\` = c.\`TABLE_NAME\`
       WHERE c.\`TABLE_SCHEMA\` = ? AND t.\`TABLE_TYPE\` = 'BASE TABLE'
         AND c.\`DATA_TYPE\` NOT IN ('blob', 'tinyblob', 'mediumblob', 'longblob', 'binary', 'varbinary', 'bit',
           'geometry', 'point', 'linestring', 'polygon', 'multipoint', 'multilinestring', 'multipolygon', 'geometrycollection')
       ORDER BY c.\`TABLE_NAME\`, c.\`ORDINAL_POSITION\``, [database]);
        const tables = new Map();
        columns.forEach((row) => {
            if (!tables.has(row.TABLE_NAME))
                tables.set(row.TABLE_NAME, []);
            tables.get(row.TABLE_NAME).push({
                name: row.COLUMN_NAME,
                isText: /char|text|enum|set|json/i.test(row.DATA_TYPE),
            });
        });
        // numbers and dates are compared as text - otherwise 'abc' = 0 matches and invalid date fails the query
        const searched = (column) => column.isText
            ? mysql.escapeId(column.name)
            : `CAST(${mysql.escapeId(column.name)} AS CHAR)`;
        // LIKE wildcards in term are searched literally
        const pattern = mode === 'exact' ? term : `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
        const operator = mode === 'exact' ? '=' : 'LIKE';
        const warnings = [];
        for (const [table, tableColumns] of Array.from(tables.entries())) {
            const counts = tableColumns.map((column, index) => mysql.format(`SUM(${searched(column)} ${operator} ?) AS ??`, [pattern, `c${index}`])).join(', ');
            const where = tableColumns.map((column) => mysql.format(`${searched(column)} ${operator} ?`, [pattern])).join(' OR ');
            try {
                const [row] = await this.queryRows(`SELECT COUNT(*) AS \`total\`, ${counts} FROM ??.?? WHERE ${where}`, [database, table]);
                const rows = Number(row.total);
                if (rows > 0) {
                    onResult({
                        table,
                        rows,
                        columns: tableColumns
                            .map((column, index) => ({ name: column.name, rows: Number(row[`c${index}`]), text: column.isText }))
                            .filter((column) => column.rows > 0),
                    });
                }
            }
            catch (e) {
                warnings.push(`${table}: ${(e === null || e === void 0 ? void 0 : e.sqlMessage) || (e === null || e === void 0 ? void 0 : e.message) || e}`);
            }
        }
        return { tables: tables.size, warnings };
    }
    async executeStatements(statements) {
        for (let index = 0; index < statements.length; index++) {
            try {
                await this.queryRows(statements[index]);
            }
            catch (e) {
                // DDL is committed immediately - tell which statements were already executed
                if (statements.length > 1 && (e === null || e === void 0 ? void 0 : e.sqlMessage)) {
                    e.sqlMessage = `${e.sqlMessage}. Executed ${index} of ${statements.length} statements.`;
                }
                throw e;
            }
        }
    }
    queryRows(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.getPool().query(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
        });
    }
    static toNumber(value) {
        return value === null || value === undefined ? null : Number(value);
    }
    async loadTableInfo(db, name) {
        const rows = await this.queryRows(`SELECT \`TABLE_TYPE\`, \`ENGINE\`, \`TABLE_COLLATION\`, \`ROW_FORMAT\`, \`TABLE_ROWS\`, \`DATA_LENGTH\`,
              \`INDEX_LENGTH\`, \`AUTO_INCREMENT\`, \`TABLE_COMMENT\`, \`CREATE_TIME\`, \`UPDATE_TIME\`
       FROM \`information_schema\`.\`TABLES\` WHERE \`TABLE_SCHEMA\` = ? AND \`TABLE_NAME\` = ?`, [db, name]);
        if (!rows.length) {
            return null;
        }
        const row = rows[0];
        return {
            type: row.TABLE_TYPE,
            engine: row.ENGINE,
            collation: row.TABLE_COLLATION,
            rowFormat: row.ROW_FORMAT,
            rows: MysqlAdapter.toNumber(row.TABLE_ROWS),
            dataLength: MysqlAdapter.toNumber(row.DATA_LENGTH),
            indexLength: MysqlAdapter.toNumber(row.INDEX_LENGTH),
            autoIncrement: MysqlAdapter.toNumber(row.AUTO_INCREMENT),
            comment: row.TABLE_COMMENT || '',
            createTime: row.CREATE_TIME,
            updateTime: row.UPDATE_TIME,
        };
    }
    /** SHOW FULL COLUMNS - default is the same on MySQL and MariaDB (information_schema quotes it on MariaDB) */
    async loadStructureColumns(db, name) {
        const [rows, schemaRows, isMariaDb] = await Promise.all([
            this.queryRows('SHOW FULL COLUMNS FROM ??.??', [db, name]),
            this.queryRows('SELECT `COLUMN_NAME`, `COLUMN_DEFAULT`, `GENERATION_EXPRESSION` FROM `information_schema`.`COLUMNS` WHERE `TABLE_SCHEMA` = ? AND `TABLE_NAME` = ?', [db, name]),
            this.isMariaDb(),
        ]);
        const schemaColumns = new Map(schemaRows.map((row) => [row.COLUMN_NAME, row]));
        return rows.map((row) => {
            var _a, _b;
            return ({
                name: row.Field,
                type: row.Type,
                nullable: row.Null === 'YES',
                defaultValue: row.Default === undefined ? null : row.Default,
                defaultIsExpression: MysqlAdapter.isDefaultExpression(row, (_a = schemaColumns.get(row.Field)) === null || _a === void 0 ? void 0 : _a.COLUMN_DEFAULT, isMariaDb),
                generationExpression: ((_b = schemaColumns.get(row.Field)) === null || _b === void 0 ? void 0 : _b.GENERATION_EXPRESSION) || null,
                extra: row.Extra || '',
                comment: row.Comment || '',
                collation: row.Collation,
                key: row.Key || '',
            });
        });
    }
    /**
     * MySQL marks expression defaults with DEFAULT_GENERATED.
     * MariaDB quotes literal strings in information_schema, expressions are not quoted.
     */
    static isDefaultExpression(row, schemaDefault, isMariaDb) {
        if (row.Default === null || row.Default === undefined) {
            return false;
        }
        if (/DEFAULT_GENERATED/i.test(row.Extra || '') || /^(current_timestamp|now|localtime|localtimestamp)(\(\d*\))?$/i.test(row.Default)) {
            return true;
        }
        // MySQL returns literal defaults unquoted - without DEFAULT_GENERATED they are values
        if (!isMariaDb || typeof schemaDefault !== 'string' || schemaDefault === 'NULL') {
            return false;
        }
        const isQuoted = schemaDefault.startsWith("'");
        const isNumber = /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(schemaDefault);
        return !isQuoted && !isNumber;
    }
    /** server flavor, read once per connection */
    isMariaDb() {
        if (!this.mariaDb) {
            this.mariaDb = this.queryRows('SELECT VERSION() AS `version`')
                .then((rows) => { var _a; return /mariadb/i.test(((_a = rows[0]) === null || _a === void 0 ? void 0 : _a.version) || ''); })
                .catch(() => {
                this.mariaDb = null;
                return false;
            });
        }
        return this.mariaDb;
    }
    async loadIndexes(db, name) {
        const rows = await this.queryRows('SHOW INDEX FROM ??.??', [db, name]);
        const indexes = new Map();
        rows.forEach((row) => {
            var _a;
            if (!indexes.has(row.Key_name)) {
                indexes.set(row.Key_name, {
                    name: row.Key_name,
                    unique: Number(row.Non_unique) === 0,
                    primary: row.Key_name === 'PRIMARY',
                    type: row.Index_type,
                    columns: [],
                    comment: row.Index_comment || '',
                });
            }
            indexes.get(row.Key_name).columns.push({
                // functional index (MySQL 8) has expression instead of column
                name: (_a = row.Column_name) !== null && _a !== void 0 ? _a : `(${row.Expression})`,
                subPart: MysqlAdapter.toNumber(row.Sub_part),
                descending: row.Collation === 'D',
            });
        });
        return Array.from(indexes.values());
    }
    async loadForeignKeys(where, db, name) {
        const rows = await this.queryRows(`SELECT k.\`CONSTRAINT_NAME\`, k.\`TABLE_SCHEMA\`, k.\`TABLE_NAME\`, k.\`COLUMN_NAME\`,
              k.\`REFERENCED_TABLE_SCHEMA\`, k.\`REFERENCED_TABLE_NAME\`, k.\`REFERENCED_COLUMN_NAME\`,
              r.\`UPDATE_RULE\`, r.\`DELETE_RULE\`
       FROM \`information_schema\`.\`KEY_COLUMN_USAGE\` k
       JOIN \`information_schema\`.\`REFERENTIAL_CONSTRAINTS\` r
         ON r.\`CONSTRAINT_SCHEMA\` = k.\`CONSTRAINT_SCHEMA\` AND r.\`CONSTRAINT_NAME\` = k.\`CONSTRAINT_NAME\` AND r.\`TABLE_NAME\` = k.\`TABLE_NAME\`
       WHERE ${where} AND k.\`REFERENCED_TABLE_NAME\` IS NOT NULL
       ORDER BY k.\`TABLE_SCHEMA\`, k.\`TABLE_NAME\`, k.\`CONSTRAINT_NAME\`, k.\`ORDINAL_POSITION\``, [db, name]);
        const keys = new Map();
        rows.forEach((row) => {
            const id = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}.${row.CONSTRAINT_NAME}`;
            if (!keys.has(id)) {
                keys.set(id, {
                    name: row.CONSTRAINT_NAME,
                    table: { databaseName: row.TABLE_SCHEMA, name: row.TABLE_NAME },
                    columns: [],
                    referencedTable: { databaseName: row.REFERENCED_TABLE_SCHEMA, name: row.REFERENCED_TABLE_NAME },
                    referencedColumns: [],
                    onUpdate: row.UPDATE_RULE,
                    onDelete: row.DELETE_RULE,
                });
            }
            keys.get(id).columns.push(row.COLUMN_NAME);
            keys.get(id).referencedColumns.push(row.REFERENCED_COLUMN_NAME);
        });
        return Array.from(keys.values());
    }
    async loadTriggers(db, name) {
        const rows = await this.queryRows(`SELECT \`TRIGGER_NAME\`, \`ACTION_TIMING\`, \`EVENT_MANIPULATION\`, \`ACTION_STATEMENT\`
       FROM \`information_schema\`.\`TRIGGERS\` WHERE \`EVENT_OBJECT_SCHEMA\` = ? AND \`EVENT_OBJECT_TABLE\` = ?
       ORDER BY \`EVENT_MANIPULATION\`, \`ACTION_TIMING\`, \`ACTION_ORDER\``, [db, name]);
        return rows.map((row) => ({
            name: row.TRIGGER_NAME,
            timing: row.ACTION_TIMING,
            event: row.EVENT_MANIPULATION,
            statement: row.ACTION_STATEMENT,
        }));
    }
    async loadDdl(db, name) {
        var _a, _b;
        const rows = await this.queryRows('SHOW CREATE TABLE ??.??', [db, name]);
        return ((_a = rows[0]) === null || _a === void 0 ? void 0 : _a['Create Table']) || ((_b = rows[0]) === null || _b === void 0 ? void 0 : _b['Create View']) || '';
    }
    /** NULL must be compared with IS NULL, `= NULL` never matches */
    static buildWhere(where) {
        const entries = Object.entries(where || {});
        if (!entries.length) {
            // never change whole table
            throw new Error('Row cannot be identified - missing WHERE values');
        }
        return entries
            .map(([column, value]) => value === null
            ? mysql.format('?? IS NULL', [column])
            // Buffer of binary key is formatted as X'...'
            : mysql.format('?? = ?', [column, BinaryValue_1.deserializeBinaryValue(value)]))
            .join(' AND ');
    }
    /** enum('a','it''s') -> ['a', "it's"] */
    static parseEnumValues(type) {
        const match = /^enum\((.*)\)$/i.exec(type);
        if (!match) {
            return undefined;
        }
        const values = [];
        const valueRegex = /'((?:[^']|'')*)'/g;
        let item;
        while ((item = valueRegex.exec(match[1])) !== null) {
            values.push(item[1].replace(/''/g, "'"));
        }
        return values;
    }
    /** binary values are not sent to client in editable form */
    static isEditableType(type) {
        return !/blob|binary|^bit|geometry|point|linestring|polygon/i.test(type);
    }
    /** pool is opened again after releaseConnections */
    getPool() {
        if (!this.connected) {
            throw new Error('Not connected');
        }
        if (!this.pool) {
            this.pool = this.createPool();
        }
        return this.pool;
    }
    getReferencesColumns(databaseName, tableName) {
        const sql = `SELECT
          \`COLUMN_NAME\`,
          \`REFERENCED_TABLE_SCHEMA\`,
          \`REFERENCED_TABLE_NAME\`,
          \`REFERENCED_COLUMN_NAME\`
      FROM \`INFORMATION_SCHEMA\`.\`KEY_COLUMN_USAGE\`
      WHERE
          \`TABLE_SCHEMA\` = ?
      AND \`TABLE_NAME\` = ?
      AND \`REFERENCED_TABLE_NAME\` IS NOT NULL
      `;
        return new Promise((resolve, reject) => {
            this.getPool().query(sql, [databaseName, tableName], (err, results) => {
                if (err) {
                    reject(err);
                    return;
                }
                const converted = results.map((result) => {
                    return {
                        columnName: result.REFERENCED_COLUMN_NAME,
                        originColumnName: result.COLUMN_NAME,
                        table: {
                            // foreign key can point to other database
                            databaseName: result.REFERENCED_TABLE_SCHEMA || databaseName,
                            name: result.REFERENCED_TABLE_NAME
                        }
                    };
                });
                resolve(converted);
            });
        });
    }
    findReference(columnName, references) {
        return references.find((reference) => reference.originColumnName === columnName);
    }
    log(input) {
        if (this.consoleLog) {
            if (typeof input === 'string') {
                console.log(`\x1b[33m ${input} \x1b[0m`);
            }
            else {
                console.log(input);
            }
        }
    }
}
exports.default = MysqlAdapter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTXlzcWxBZGFwdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9NeXNxbC9NeXNxbEFkYXB0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSwrQkFBZ0M7QUFXaEMsa0VBQTBDO0FBQzFDLHdFQUFnRDtBQUVoRCxnRUFBd0M7QUFFeEMsZ0ZBQXdEO0FBQ3hELDhEQUFzQztBQWV0QyxnREFBc0Q7QUFDdEQsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQy9CLE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQztBQUU5QyxNQUFNLFlBQVk7SUFZaEIsWUFBWSxjQUEwQyxFQUFFLFVBQXFCO1FBWHBFLFlBQU8sR0FBbUIsT0FBTyxDQUFDO1FBQ25DLGVBQVUsR0FBRyxJQUFJLENBQUM7UUFDbEIsU0FBSSxHQUFnQixJQUFJLENBQUM7UUFDakMsOERBQThEO1FBQ3RELGNBQVMsR0FBRyxLQUFLLENBQUM7UUFDbEIsd0JBQW1CLEdBQTBCLElBQUksQ0FBQztRQXdFMUQsMkRBQTJEO1FBQzFDLG9CQUFlLEdBQUcsSUFBSSxHQUFHLEVBQXdCLENBQUM7UUFxYjNELFlBQU8sR0FBNEIsSUFBSSxDQUFDO1FBMEl4Qyx1QkFBa0IsR0FBRyxDQUFDLEtBQVksRUFBeUIsRUFBRTtZQUNuRSxJQUFJLENBQUMsR0FBRyxDQUFDLGlCQUFpQixLQUFLLEVBQUUsQ0FBQyxDQUFDO1lBRW5DLE9BQU8sSUFBSSxpQkFBVSxDQUFDLFFBQVEsQ0FBQyxFQUFFO2dCQUMvQixJQUFJLENBQUMsT0FBTyxFQUFFLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQztxQkFDeEIsRUFBRSxDQUFDLE9BQU8sRUFBRSxDQUFDLEtBQWlCLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7cUJB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