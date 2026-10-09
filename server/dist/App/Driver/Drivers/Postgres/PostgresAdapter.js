"use strict";
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const pg_1 = require("pg");
const rxjs_1 = require("rxjs");
const SelectAnalyser_1 = __importDefault(require("../../Query/SelectAnalyser"));
const PostgresSql_1 = __importDefault(require("./PostgresSql"));
const PostgresSession_1 = __importDefault(require("./PostgresSession"));
const PostgresCatalog_1 = __importDefault(require("./PostgresCatalog"));
const PostgresDdlBuilder_1 = __importDefault(require("./PostgresDdlBuilder"));
const PostgresDumper_1 = __importDefault(require("./PostgresDumper"));
const PostgresUsers_1 = __importDefault(require("./PostgresUsers"));
const BinaryValue_1 = require("../BinaryValue");
const { Parser } = require('node-sql-parser');
/** types without = operator - rows are identified by text form of value */
const NO_EQUALITY_TYPE = /^(json|xml|point|line|lseg|box|path|polygon|circle)\b/i;
/**
 * PostgreSQL driver. Connection is made to one database, "databases" of application are its schemas.
 * @author Mateusz Bochen
 */
class PostgresAdapter {
    constructor(connectionData, dsnOptions) {
        this.connectionData = connectionData;
        this.dsnOptions = dsnOptions;
        this.dialect = 'postgresql';
        this.pool = null;
        /** credentials were verified and disconnect was not called */
        this.connected = false;
        /** types of columns known from table metadata - for WHERE of row changes */
        this.columnTypes = new Map();
        /** sessions running for tabs - cancel stops their query */
        this.runningSessions = new Map();
        /** clients with error listener - connection lost while client is checked out must not crash server */
        this.watchedClients = new WeakSet();
        /**
         * schema, table and column of result fields - PostgreSQL describes them by oid of table and number of column.
         * Table alias is taken from query, key is `alias.name` when name repeats in result.
         */
        this.resolveFields = async (fields, query) => {
            const tableIds = Array.from(new Set(fields.map((field) => field.tableID).filter((tableId) => tableId > 0)));
            const columns = new Map();
            if (tableIds.length) {
                const rows = await this.queryRows(`SELECT a.attrelid::int AS table_id, a.attnum, a.attname, c.relname, n.nspname
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE a.attrelid = ANY($1) AND a.attnum > 0`, [tableIds]);
                rows.forEach((row) => columns.set(`${row.table_id}:${row.attnum}`, { schema: row.nspname, table: row.relname, column: row.attname }));
            }
            let from = [];
            try {
                from = this.analyser.getFrom(query);
            }
            catch (e) {
                // not parsable query - table names are used instead of aliases
            }
            const aliasOf = (schema, table) => {
                const used = from.filter((item) => item.table === table && (!item.db || item.db === schema));
                return used.length === 1 && used[0].as ? used[0].as : table;
            };
            const nameCount = new Map();
            fields.forEach((field) => nameCount.set(field.name, (nameCount.get(field.name) || 0) + 1));
            const usedKeys = new Set();
            return fields.map((field, index) => {
                const source = columns.get(`${field.tableID}:${field.columnID}`);
                const alias = source ? aliasOf(source.schema, source.table) : '';
                let key = nameCount.get(field.name) > 1 && alias ? `${alias}.${field.name}` : field.name;
                if (usedKeys.has(key)) {
                    key = `${key}#${index}`;
                }
                usedKeys.add(key);
                return {
                    key,
                    name: field.name,
                    orgName: (source === null || source === void 0 ? void 0 : source.column) || '',
                    table: alias,
                    orgTable: (source === null || source === void 0 ? void 0 : source.table) || '',
                    db: (source === null || source === void 0 ? void 0 : source.schema) || '',
                };
            });
        };
        this.analyser = new SelectAnalyser_1.default(new Parser(), this.dialect);
    }
    async connect() {
        const pool = this.createPool();
        try {
            // check credentials with first connection
            const client = await pool.connect();
            client.release();
        }
        catch (e) {
            await pool.end().catch(() => undefined);
            throw e;
        }
        this.pool = pool;
        this.connected = true;
        return this;
    }
    users() {
        return new PostgresUsers_1.default((sql, params) => this.queryRows(sql, params));
    }
    disconnect() {
        this.connected = false;
        this.releaseConnections();
    }
    releaseConnections() {
        if (this.pool) {
            this.pool.end().catch((e) => console.log(e));
            this.pool = null;
        }
    }
    createPool() {
        var _a;
        const sslMode = String(((_a = this.dsnOptions.params) === null || _a === void 0 ? void 0 : _a.sslmode) || '');
        const pool = new pg_1.Pool({
            host: this.dsnOptions.host,
            port: this.dsnOptions.port || 5432,
            user: this.connectionData.userData.username,
            password: this.connectionData.userData.password,
            // connection is always made to one database
            database: this.dsnOptions.db || 'postgres',
            ssl: ['require', 'verify-ca', 'verify-full'].includes(sslMode) ? { rejectUnauthorized: sslMode !== 'require' } : undefined,
            max: 5,
            keepAlive: true,
            application_name: 'Flase',
        });
        // idle client lost connection - pool removes it
        pool.on('error', (error) => console.log('PostgreSQL pool error', error.message));
        return pool;
    }
    getPool() {
        if (!this.connected) {
            throw new Error('Not connected');
        }
        if (!this.pool) {
            this.pool = this.createPool();
        }
        return this.pool;
    }
    async queryRows(sql, params = []) {
        return (await this.getPool().query(sql, params)).rows;
    }
    catalog() {
        return new PostgresCatalog_1.default({ query: (text, values) => this.getPool().query(text, values) });
    }
    async openSession(database, tabId) {
        const client = await this.getPool().connect();
        if (!this.watchedClients.has(client)) {
            this.watchedClients.add(client);
            client.on('error', (error) => console.log('PostgreSQL connection error', error.message));
        }
        const session = new PostgresSession_1.default(client, this.analyser, this.resolveFields, tabId ? () => {
            if (this.runningSessions.get(tabId) === session) {
                this.runningSessions.delete(tabId);
            }
        } : undefined);
        try {
            // pooled connection keeps transaction, SET variables, search_path, temporary tables and prepared statements
            // of previous session - every session starts with clean connection
            await client.query('ROLLBACK');
            await client.query('DISCARD ALL');
            if (database) {
                await session.setSearchPath(database);
            }
        }
        catch (e) {
            client.release(e);
            throw e;
        }
        if (tabId) {
            this.runningSessions.set(tabId, session);
        }
        return session;
    }
    async cancel(tabId) {
        const session = this.runningSessions.get(tabId);
        const processId = session === null || session === void 0 ? void 0 : session.processId;
        if (!session || !processId) {
            return false;
        }
        // import checks it between statements, pg_cancel_backend stops the running one
        session.markCancelled();
        await this.queryRows('SELECT pg_cancel_backend($1)', [processId]);
        return true;
    }
    async getProcessList() {
        var _a;
        const ownProcesses = new Set((((_a = this.pool) === null || _a === void 0 ? void 0 : _a._clients) || []).map((client) => client.processID));
        const rows = await this.queryRows(`SELECT pid, usename, client_addr, client_port, datname, state, wait_event_type, wait_event, query,
              EXTRACT(EPOCH FROM (now() - COALESCE(CASE WHEN state = 'active' THEN query_start END, state_change, backend_start)))::int AS seconds
       FROM pg_stat_activity
       WHERE backend_type = 'client backend'
       ORDER BY pid`);
        return rows.map((row) => ({
            id: Number(row.pid),
            user: row.usename,
            host: row.client_addr ? `${row.client_addr}:${row.client_port}` : 'local',
            db: row.datname,
            command: row.state || '',
            time: Number(row.seconds) || 0,
            state: row.wait_event ? `${row.wait_event_type}: ${row.wait_event}` : null,
            info: row.query || null,
            own: ownProcesses.has(Number(row.pid)),
        }));
    }
    async killProcess(id, connection) {
        if (!Number.isInteger(id) || id <= 0) {
            throw new Error('Invalid process id');
        }
        const [row] = await this.queryRows(connection ? 'SELECT pg_terminate_backend($1) AS done' : 'SELECT pg_cancel_backend($1) AS done', [id]);
        if (!(row === null || row === void 0 ? void 0 : row.done)) {
            throw new Error(`Process ${id} does not exist or it cannot be stopped by this user`);
        }
    }
    dump(options, write) {
        return new PostgresDumper_1.default(this.getPool(), options).dump(write);
    }
    buildInsertStatement(database, table, columns, rows) {
        return `INSERT INTO ${PostgresSql_1.default.table(database, table)} (${PostgresSql_1.default.identifiers(columns)}) VALUES\n`
            + rows.map((row) => `(${row.map((value) => PostgresSql_1.default.literal(value)).join(', ')})`).join(',\n');
    }
    /** schemas of database, system schemas are at the end */
    getListOfDatabases() {
        return new rxjs_1.Observable((observer) => {
            this.queryRows(`SELECT nspname AS name FROM pg_namespace
         WHERE nspname NOT LIKE 'pg\\_toast%' AND nspname NOT LIKE 'pg\\_temp\\_%'
         ORDER BY nspname IN ('pg_catalog', 'information_schema'), nspname`).then((rows) => {
                rows.forEach((row) => observer.next({ name: row.name }));
                observer.complete();
            }).catch((error) => observer.error(error));
        });
    }
    getListOfTablesInDatabase(schema) {
        return new rxjs_1.Observable((observer) => {
            (async () => {
                const catalog = this.catalog();
                const relations = await catalog.relations(schema);
                // empty objects first - list is shown before columns are loaded
                relations.forEach((relation) => observer.next({
                    tableName: relation.name,
                    columns: [],
                    preload: true,
                    dataBaseName: schema,
                    primaryColumns: [],
                    uniqueColumns: [],
                }));
                if (relations.length) {
                    const columns = await this.loadColumns(schema, null);
                    relations.forEach((relation) => {
                        const tableColumns = columns.get(relation.name) || [];
                        observer.next({
                            tableName: relation.name,
                            columns: tableColumns,
                            preload: false,
                            dataBaseName: schema,
                            primaryColumns: tableColumns.filter((column) => column.primaryKey),
                            uniqueColumns: [],
                        });
                    });
                }
                observer.complete();
            })().catch((error) => observer.error(error));
        });
    }
    getSelectFromTypeFromQuery(query) {
        return this.analyser.getFrom(query);
    }
    async getColumnsOfTable(schema, selectFromType) {
        const columns = (await this.loadColumns(schema, [selectFromType.table])).get(selectFromType.table) || [];
        if (!columns.length) {
            throw new Error(`Table ${schema}.${selectFromType.table} does not exist`);
        }
        return columns.map((column) => (Object.assign(Object.assign({}, column), { table: Object.assign(Object.assign({}, column.table), { alias: selectFromType.as }) })));
    }
    /** columns with primary keys and references, by table name */
    async loadColumns(schema, tables) {
        const catalog = this.catalog();
        const [columns, primaryKeys, foreignKeys] = await Promise.all([
            catalog.columns(schema, tables),
            catalog.primaryKeys(schema, tables),
            catalog.foreignKeys(schema, (tables === null || tables === void 0 ? void 0 : tables.length) === 1 ? tables[0] : null),
        ]);
        const byTable = new Map();
        columns.forEach((column) => {
            var _a;
            if (!byTable.has(column.table)) {
                byTable.set(column.table, []);
                this.columnTypes.set(`${schema}.${column.table}`, new Map());
            }
            this.columnTypes.get(`${schema}.${column.table}`).set(column.name, column.type);
            // single column foreign key - value links to referenced row
            const key = foreignKeys.find((item) => item.table.name === column.table && item.columns.length === 1 && item.columns[0] === column.name);
            byTable.get(column.table).push({
                table: { databaseName: schema, name: column.table },
                autoIncrement: !!column.identity || column.serial,
                defaultValue: (_a = column.defaultLiteral) !== null && _a !== void 0 ? _a : column.defaultExpression,
                name: column.name,
                key: column.name,
                orgName: column.name,
                type: column.type,
                enumValues: column.enumValues || undefined,
                // ALWAYS identity cannot be updated, generated columns are computed
                editable: !column.isBinary && !column.generated && column.identity !== 'a',
                nullable: column.nullable,
                primaryKey: primaryKeys.some((item) => item.table === column.table && item.column === column.name),
                reference: key ? {
                    columnName: key.referencedColumns[0],
                    originColumnName: column.name,
                    table: { databaseName: key.referencedTable.databaseName, name: key.referencedTable.name },
                } : undefined,
            });
        });
        return byTable;
    }
    getEditableTableOfQuery(query) {
        return this.analyser.getEditableTable(query);
    }
    buildRowChangeStatements(table, changes) {
        const tableName = PostgresSql_1.default.table(table.databaseName, table.name);
        const types = this.columnTypes.get(`${table.databaseName}.${table.name}`);
        // UPDATE / DELETE have no LIMIT - one row of table without primary key is found by its physical address
        const where = (change) => change.limitOne
            ? `ctid = (SELECT ctid FROM ${tableName} WHERE ${PostgresAdapter.buildWhere(change.where, types)} LIMIT 1)`
            : PostgresAdapter.buildWhere(change.where, types);
        return changes.map((change) => {
            switch (change.kind) {
                case 'update': {
                    const entries = Object.entries(change.values || {});
                    if (!entries.length) {
                        throw new Error('Update without values');
                    }
                    const set = entries.map(([column, value]) => `${PostgresSql_1.default.identifier(column)} = ${PostgresSql_1.default.literal(value)}`).join(', ');
                    return { sql: `UPDATE ${tableName} SET ${set} WHERE ${where(change)}`, expectOneRow: true };
                }
                case 'delete':
                    return { sql: `DELETE FROM ${tableName} WHERE ${where(change)}`, expectOneRow: true };
                case 'insert': {
                    const values = change.values || {};
                    const columns = Object.keys(values);
                    return {
                        sql: columns.length
                            ? `INSERT INTO ${tableName} (${PostgresSql_1.default.identifiers(columns)}) VALUES (${columns.map((column) => PostgresSql_1.default.literal(values[column])).join(', ')})`
                            : `INSERT INTO ${tableName} DEFAULT VALUES`,
                        expectOneRow: false,
                    };
                }
                default:
                    throw new Error(`Unknown change ${change.kind}`);
            }
        });
    }
    /** NULL must be compared with IS NULL, `= NULL` never matches */
    static buildWhere(where, types) {
        const entries = Object.entries(where || {});
        if (!entries.length) {
            // never change whole table
            throw new Error('Row cannot be identified - missing WHERE values');
        }
        return entries.map(([column, value]) => {
            const name = PostgresSql_1.default.identifier(column);
            if (value === null) {
                return `${name} IS NULL`;
            }
            const bytes = BinaryValue_1.deserializeBinaryValue(value);
            if (Buffer.isBuffer(bytes)) {
                return `${name} = '\\x${bytes.toString('hex')}'::bytea`;
            }
            return NO_EQUALITY_TYPE.test((types === null || types === void 0 ? void 0 : types.get(column)) || '')
                ? `${name}::text = ${PostgresSql_1.default.literal(value)}`
                : `${name} = ${PostgresSql_1.default.literal(value)}`;
        }).join(' AND ');
    }
    async getTableStructure(table) {
        const warnings = [];
        const schema = table.databaseName;
        const name = table.name;
        const catalog = this.catalog();
        // missing privileges for one part must not hide the rest
        const load = (part, loader, fallback) => loader.catch((e) => {
            warnings.push(`${part}: ${(e === null || e === void 0 ? void 0 : e.message) || e}`);
            return fallback;
        });
        const info = await load('Table information', catalog.tableInfo(schema, name), null);
        if (!info) {
            throw new Error(`Table ${schema}.${name} does not exist`);
        }
        const isView = /VIEW/i.test(info.type);
        const [columns, indexes, foreignKeys, referencedBy, triggers, ddl] = await Promise.all([
            load('Columns', catalog.structureColumns(schema, name), []),
            isView ? Promise.resolve([]) : load('Indexes', catalog.indexes(schema, name), []),
            isView ? Promise.resolve([]) : load('Foreign keys', catalog.foreignKeys(schema, name), []),
            isView ? Promise.resolve([]) : load('Referenced by', catalog.foreignKeys(schema, name, true), []),
            load('Triggers', catalog.triggers(schema, name), []),
            load('DDL', catalog.ddl(schema, name), ''),
        ]);
        return {
            table: { databaseName: schema, name },
            info,
            columns,
            indexes: indexes.map((_a) => {
                var { constraint, definition } = _a, index = __rest(_a, ["constraint", "definition"]);
                return index;
            }),
            foreignKeys,
            referencedBy,
            triggers: triggers.map(({ name: triggerName, timing, event, statement }) => ({ name: triggerName, timing, event, statement })),
            ddl,
            warnings,
        };
    }
    buildStructureChangeStatements(table, change) {
        return new PostgresDdlBuilder_1.default(this.catalog()).build(table, change);
    }
    /** DDL of PostgreSQL is transactional - all statements are executed or none */
    async executeStatements(statements) {
        const client = await this.getPool().connect();
        try {
            await client.query('BEGIN');
            for (let index = 0; index < statements.length; index++) {
                try {
                    await client.query(statements[index]);
                }
                catch (e) {
                    if (statements.length > 1) {
                        e.message = `${e.message}. Statement ${index + 1} of ${statements.length} failed, nothing was changed.`;
                    }
                    throw e;
                }
            }
            await client.query('COMMIT');
        }
        catch (e) {
            await client.query('ROLLBACK').catch(() => undefined);
            throw e;
        }
        finally {
            client.release();
        }
    }
    async searchDatabase(schema, term, mode, onResult) {
        const columns = (await this.catalog().columns(schema, null)).filter((column) => !column.isBinary);
        const relations = await this.catalog().relations(schema);
        const tables = new Map();
        columns
            .filter((column) => relations.some((relation) => relation.name === column.table && ['r', 'p'].includes(relation.kind)))
            .forEach((column) => {
            if (!tables.has(column.table))
                tables.set(column.table, []);
            tables.get(column.table).push({ name: column.name, isText: /^(varchar|char|text|citext|name)(\(\d+\))?$/i.test(column.type) });
        });
        // other types are compared as text - LIKE on number / date / json does not exist
        const searched = (column) => column.isText
            ? PostgresSql_1.default.identifier(column.name)
            : `${PostgresSql_1.default.identifier(column.name)}::text`;
        // case insensitive as in MySQL, LIKE wildcards in term are searched literally
        const pattern = PostgresSql_1.default.literal(mode === 'exact' ? term : `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
        const operator = mode === 'exact' ? '=' : 'ILIKE';
        const warnings = [];
        for (const [table, tableColumns] of Array.from(tables.entries())) {
            const counts = tableColumns.map((column, index) => `COUNT(*) FILTER (WHERE ${searched(column)} ${operator} ${pattern}) AS c${index}`).join(', ');
            const where = tableColumns.map((column) => `${searched(column)} ${operator} ${pattern}`).join(' OR ');
            try {
                const [row] = await this.queryRows(`SELECT COUNT(*) AS total, ${counts} FROM ${PostgresSql_1.default.table(schema, table)} WHERE ${where}`);
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
                warnings.push(`${table}: ${(e === null || e === void 0 ? void 0 : e.message) || e}`);
            }
        }
        return { tables: tables.size, warnings };
    }
}
exports.default = PostgresAdapter;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUG9zdGdyZXNBZGFwdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9Qb3N0Z3Jlcy9Qb3N0Z3Jlc0FkYXB0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJCQUFvQztBQUNwQywrQkFBZ0M7QUFrQmhDLGdGQUF3RDtBQUV4RCxnRUFBd0M7QUFDeEMsd0VBQW9FO0FBQ3BFLHdFQUEwRTtBQUMxRSw4RUFBc0Q7QUFDdEQsc0VBQThDO0FBQzlDLG9FQUE0QztBQUU1QyxnREFBc0Q7QUFDdEQsTUFBTSxFQUFFLE1BQU0sRUFBRSxHQUFHLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO0FBRTlDLDJFQUEyRTtBQUMzRSxNQUFNLGdCQUFnQixHQUFHLHdEQUF3RCxDQUFDO0FBRWxGOzs7R0FHRztBQUNILE1BQU0sZUFBZTtJQWFuQixZQUE2QixjQUEwQyxFQUFtQixVQUFxQjtRQUFsRixtQkFBYyxHQUFkLGNBQWMsQ0FBNEI7UUFBbUIsZUFBVSxHQUFWLFVBQVUsQ0FBVztRQVp0RyxZQUFPLEdBQW1CLFlBQVksQ0FBQztRQUN4QyxTQUFJLEdBQWdCLElBQUksQ0FBQztRQUNqQyw4REFBOEQ7UUFDdEQsY0FBUyxHQUFHLEtBQUssQ0FBQztRQUUxQiw0RUFBNEU7UUFDM0QsZ0JBQVcsR0FBRyxJQUFJLEdBQUcsRUFBK0IsQ0FBQztRQUN0RSwyREFBMkQ7UUFDMUMsb0JBQWUsR0FBRyxJQUFJLEdBQUcsRUFBMkIsQ0FBQztRQUN0RSxzR0FBc0c7UUFDckYsbUJBQWMsR0FBRyxJQUFJLE9BQU8sRUFBYyxDQUFDO1FBc1E1RDs7O1dBR0c7UUFDSyxrQkFBYSxHQUFHLEtBQUssRUFBRSxNQUEwQixFQUFFLEtBQWEsRUFBbUMsRUFBRTtZQUMzRyxNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FB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