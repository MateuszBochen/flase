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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiUG9zdGdyZXNBZGFwdGVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vc3JjL0FwcC9Ecml2ZXIvRHJpdmVycy9Qb3N0Z3Jlcy9Qb3N0Z3Jlc0FkYXB0ZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDJCQUFvQztBQUNwQywrQkFBZ0M7QUFrQmhDLGdGQUF3RDtBQUV4RCxnRUFBd0M7QUFDeEMsd0VBQW9FO0FBQ3BFLHdFQUEwRTtBQUMxRSw4RUFBc0Q7QUFDdEQsc0VBQThDO0FBQzlDLE1BQU0sRUFBRSxNQUFNLEVBQUUsR0FBRyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQztBQUU5QywyRUFBMkU7QUFDM0UsTUFBTSxnQkFBZ0IsR0FBRyx3REFBd0QsQ0FBQztBQUVsRjs7O0dBR0c7QUFDSCxNQUFNLGVBQWU7SUFhbkIsWUFBNkIsY0FBMEMsRUFBbUIsVUFBcUI7UUFBbEYsbUJBQWMsR0FBZCxjQUFjLENBQTRCO1FBQW1CLGVBQVUsR0FBVixVQUFVLENBQVc7UUFadEcsWUFBTyxHQUFtQixZQUFZLENBQUM7UUFDeEMsU0FBSSxHQUFnQixJQUFJLENBQUM7UUFDakMsOERBQThEO1FBQ3RELGNBQVMsR0FBRyxLQUFLLENBQUM7UUFFMUIsNEVBQTRFO1FBQzNELGdCQUFXLEdBQUcsSUFBSSxHQUFHLEVBQStCLENBQUM7UUFDdEUsMkRBQTJEO1FBQzFDLG9CQUFlLEdBQUcsSUFBSSxHQUFHLEVBQTJCLENBQUM7UUFDdEUsc0dBQXNHO1FBQ3JGLG1CQUFjLEdBQUcsSUFBSSxPQUFPLEVBQWMsQ0FBQztRQWtRNUQ7OztXQUdHO1FBQ0ssa0JBQWEsR0FBRyxLQUFLLEVBQUUsTUFBMEIsRUFBRSxLQUFhLEVBQW1DLEVBQUU7WUFDM0csTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsS0FBSyxFQUFF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