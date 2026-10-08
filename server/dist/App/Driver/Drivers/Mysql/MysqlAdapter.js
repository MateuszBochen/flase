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
            : mysql.format('?? = ?', [column, value]))
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTXlzcWxBZGFwdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9NeXNxbC9NeXNxbEFkYXB0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSwrQkFBZ0M7QUFXaEMsa0VBQTBDO0FBQzFDLHdFQUFnRDtBQUVoRCxnRUFBd0M7QUFFeEMsZ0ZBQXdEO0FBQ3hELDhEQUFzQztBQWV0QyxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDL0IsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0FBRTlDLE1BQU0sWUFBWTtJQVloQixZQUFZLGNBQTBDLEVBQUUsVUFBcUI7UUFYcEUsWUFBTyxHQUFtQixPQUFPLENBQUM7UUFDbkMsZUFBVSxHQUFHLElBQUksQ0FBQztRQUNsQixTQUFJLEdBQWdCLElBQUksQ0FBQztRQUNqQyw4REFBOEQ7UUFDdEQsY0FBUyxHQUFHLEtBQUssQ0FBQztRQUNsQix3QkFBbUIsR0FBMEIsSUFBSSxDQUFDO1FBd0UxRCwyREFBMkQ7UUFDMUMsb0JBQWUsR0FBRyxJQUFJLEdBQUcsRUFBd0IsQ0FBQztRQXFiM0QsWUFBTyxHQUE0QixJQUFJLENBQUM7UUF5SXhDLHVCQUFrQixHQUFHLENBQUMsS0FBWSxFQUF5QixFQUFFO1lBQ25FLElBQUksQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEtBQUssRUFBRSxDQUFDLENBQUM7WUFFbkMsT0FBTyxJQUFJLGlCQUFVLENBQUMsUUFBUSxDQUFDLEVBQUU7Z0JBQy9CLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDO3FCQUN4QixFQUFFLENBQUMsT0FBTyxFQUFFLENBQUMsS0FBaUIsRUFBRSxFQUFFLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztxQkFDekQsRUFBRSxDQUFD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