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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUG9zdGdyZXNBZGFwdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9Qb3N0Z3Jlcy9Qb3N0Z3Jlc0FkYXB0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJCQUFvQztBQUNwQywrQkFBZ0M7QUFrQmhDLGdGQUF3RDtBQUV4RCxnRUFBd0M7QUFDeEMsd0VBQW9FO0FBQ3BFLHdFQUEwRTtBQUMxRSw4RUFBc0Q7QUFDdEQsc0VBQThDO0FBQzlDLG9FQUE0QztBQUU1QyxNQUFNLEVBQUUsTUFBTSxFQUFFLEdBQUcsT0FBTyxDQUFDLGlCQUFpQixDQUFDLENBQUM7QUFFOUMsMkVBQTJFO0FBQzNFLE1BQU0sZ0JBQWdCLEdBQUcsd0RBQXdELENBQUM7QUFFbEY7OztHQUdHO0FBQ0gsTUFBTSxlQUFlO0lBYW5CLFlBQTZCLGNBQTBDLEVBQW1CLFVBQXFCO1FBQWxGLG1CQUFjLEdBQWQsY0FBYyxDQUE0QjtRQUFtQixlQUFVLEdBQVYsVUFBVSxDQUFXO1FBWnRHLFlBQU8sR0FBbUIsWUFBWSxDQUFDO1FBQ3hDLFNBQUksR0FBZ0IsSUFBSSxDQUFDO1FBQ2pDLDhEQUE4RDtRQUN0RCxjQUFTLEdBQUcsS0FBSyxDQUFDO1FBRTFCLDRFQUE0RTtRQUMzRCxnQkFBVyxHQUFHLElBQUksR0FBRyxFQUErQixDQUFDO1FBQ3RFLDJEQUEyRDtRQUMxQyxvQkFBZSxHQUFHLElBQUksR0FBRyxFQUEyQixDQUFDO1FBQ3RFLHNHQUFzRztRQUNyRixtQkFBYyxHQUFHLElBQUksT0FBTyxFQUFjLENBQUM7UUFzUTVEOzs7V0FHRztRQUNLLGtCQUFhLEdBQUcsS0FBSyxFQUFFLE1BQTBCLEVBQUUsS0FBYSxFQUFtQyxFQUFFO1lBQzNHLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxD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