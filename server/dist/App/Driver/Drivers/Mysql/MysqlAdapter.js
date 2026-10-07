"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const rxjs_1 = require("rxjs");
const MysqlSession_1 = __importDefault(require("./MysqlSession"));
const MysqlDdlBuilder_1 = __importDefault(require("./MysqlDdlBuilder"));
const mysql = require('mysql');
const { Parser } = require('node-sql-parser');
class MysqlAdapter {
    constructor(connectionData, dsnOptions) {
        this.consoleLog = true;
        this.pool = null;
        /** credentials were verified and disconnect was not called */
        this.connected = false;
        this.keepaliveIntervalId = null;
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
    openSession(database) {
        return new Promise((resolve, reject) => {
            this.getPool().getConnection((err, connection) => {
                if (err) {
                    reject(err);
                    return;
                }
                connection.query('USE ??', [database], (useErr) => {
                    if (useErr) {
                        connection.release();
                        reject(useErr);
                        return;
                    }
                    resolve(new MysqlSession_1.default(connection, this.parser));
                });
            });
        });
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
        const ast = this.parser.astify(query);
        const statement = Array.isArray(ast) ? ast[0] : ast;
        return (statement === null || statement === void 0 ? void 0 : statement.from) || [];
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
                            editable: MysqlAdapter.isEditableType(type) && !/GENERATED/i.test(column.Extra || ''),
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
        var _a, _b;
        let parsed;
        try {
            parsed = this.parser.astify(query);
        }
        catch (e) {
            return { table: null, reason: 'Query could not be analysed' };
        }
        const statements = Array.isArray(parsed) ? parsed : [parsed];
        const ast = statements[0];
        if (statements.length !== 1 || (ast === null || ast === void 0 ? void 0 : ast.type) !== 'select') {
            return { table: null, reason: 'Only single SELECT result can be edited' };
        }
        if (ast._next || ast.union) {
            return { table: null, reason: 'Result of UNION cannot be edited' };
        }
        if (ast.with) {
            return { table: null, reason: 'Result of WITH query cannot be edited' };
        }
        if (!((_a = ast.from) === null || _a === void 0 ? void 0 : _a.length)) {
            return { table: null, reason: 'Result does not come from a table' };
        }
        if (ast.from.length > 1) {
            return { table: null, reason: 'Result comes from more tables (JOIN)' };
        }
        if (!ast.from[0].table || ast.from[0].expr) {
            return { table: null, reason: 'Result comes from sub query' };
        }
        const groupBy = Array.isArray(ast.groupby) ? ast.groupby : (_b = ast.groupby) === null || _b === void 0 ? void 0 : _b.columns;
        if (ast.distinct || (groupBy === null || groupBy === void 0 ? void 0 : groupBy.length) || ast.having) {
            return { table: null, reason: 'Grouped or DISTINCT result cannot be edited' };
        }
        const columns = Array.isArray(ast.columns) ? ast.columns : [];
        if (columns.some((column) => { var _a; return ((_a = column === null || column === void 0 ? void 0 : column.expr) === null || _a === void 0 ? void 0 : _a.type) === 'aggr_func'; })) {
            return { table: null, reason: 'Aggregated result cannot be edited' };
        }
        return { table: ast.from[0] };
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
                            databaseName,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiTXlzcWxBZGFwdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9NeXNxbC9NeXNxbEFkYXB0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7QUFFQSwrQkFBZ0M7QUFXaEMsa0VBQTBDO0FBQzFDLHdFQUFnRDtBQVloRCxNQUFNLEtBQUssR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUM7QUFDL0IsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0FBRTlDLE1BQU0sWUFBWTtJQVVoQixZQUFZLGNBQTBDLEVBQUUsVUFBcUI7UUFUckUsZUFBVSxHQUFHLElBQUksQ0FBQztRQUNsQixTQUFJLEdBQWdCLElBQUksQ0FBQztRQUNqQyw4REFBOEQ7UUFDdEQsY0FBUyxHQUFHLEtBQUssQ0FBQztRQUNsQix3QkFBbUIsR0FBMEIsSUFBSSxDQUFDO1FBOFpsRCxZQUFPLEdBQTRCLElBQUksQ0FBQztRQXlJeEMsdUJBQWtCLEdBQUcsQ0FBQyxLQUFZLEVBQXlCLEVBQUU7WUFDbkUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxpQkFBaUIsS0FBSyxFQUFFLENBQUMsQ0FBQztZQUVuQyxPQUFPLElBQUksaUJBQVUsQ0FBQyxRQUFRLENBQUMsRUFBRTtnQkFDL0IsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUM7cUJBQ3hCLEVBQUUsQ0FBQyxPQUFPLEVBQUUsQ0FBQyxLQUFpQixFQUFFLEVBQUUsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO3FCQUN6RCxFQUFFLENBQUMsUUFBUSxFQUFFLENBQUMsR0FBZSxFQUFFLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUN0RCx1RUFBdUU7cUJBQ3RFLEVBQUUsQ0FBQyxLQUFLLEVBQUUsR0FBRyxF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