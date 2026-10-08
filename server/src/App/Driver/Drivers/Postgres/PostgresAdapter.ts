import {Pool, PoolClient} from 'pg';
import {Observable} from 'rxjs';
import {ParsedDsn} from '@soluble/dsn-parser';
import DriverInterface from '../../DriverInterface';
import DriverSessionInterface from '../../DriverSessionInterface';
import DatabaseInterface from '../../Interface/Data/DatabaseInterface';
import ColumnInterface from '../../Interface/Data/ColumnInterface';
import SelectFromType from '../../../../Driver/Type/Data/SelectFromType';
import TableInformationInterface from '../../Interface/Data/TableInformationInterface';
import ConnectionRequestInterface from '../../../Connection/Interface/ConnectionRequestInterface';
import ProcessInterface from '../../Interface/Data/ProcessInterface';
import {DumpOptionsInterface} from '../../Interface/Data/TransferInterface';
import {StructureChangeType} from '../../Interface/Data/StructureChangeInterface';
import {DatabaseSearchResultInterface, SearchModeType} from '../../Interface/Data/DatabaseSearchInterface';
import TableInterface from '../../Interface/Data/TableInterface';
import RowChangeInterface, {RowValuesType} from '../../Interface/Data/RowChangeInterface';
import RowChangeStatementInterface from '../../Interface/Data/RowChangeStatementInterface';
import TableStructureInterface from '../../Interface/Data/TableStructureInterface';
import ResultFieldInterface from '../../Interface/Data/ResultFieldInterface';
import SelectAnalyser from '../../Query/SelectAnalyser';
import SqlDialectType from '../../Query/SqlDialectType';
import PostgresSql from './PostgresSql';
import PostgresSession, {PgFieldInterface} from './PostgresSession';
import PostgresCatalog, {CatalogColumnInterface} from './PostgresCatalog';
import PostgresDdlBuilder from './PostgresDdlBuilder';
import PostgresDumper from './PostgresDumper';
import PostgresUsers from './PostgresUsers';
import {UserManagerInterface} from '../../Interface/Data/UserInterface';
const { Parser } = require('node-sql-parser');

/** types without = operator - rows are identified by text form of value */
const NO_EQUALITY_TYPE = /^(json|xml|point|line|lseg|box|path|polygon|circle)\b/i;

/**
 * PostgreSQL driver. Connection is made to one database, "databases" of application are its schemas.
 * @author Mateusz Bochen
 */
class PostgresAdapter implements DriverInterface {
  readonly dialect: SqlDialectType = 'postgresql';
  private pool: Pool | null = null;
  /** credentials were verified and disconnect was not called */
  private connected = false;
  private readonly analyser: SelectAnalyser;
  /** types of columns known from table metadata - for WHERE of row changes */
  private readonly columnTypes = new Map<string, Map<string, string>>();
  /** sessions running for tabs - cancel stops their query */
  private readonly runningSessions = new Map<string, PostgresSession>();
  /** clients with error listener - connection lost while client is checked out must not crash server */
  private readonly watchedClients = new WeakSet<PoolClient>();

  constructor(private readonly connectionData: ConnectionRequestInterface, private readonly dsnOptions: ParsedDsn) {
    this.analyser = new SelectAnalyser(new Parser(), this.dialect);
  }

  async connect(): Promise<DriverInterface> {
    const pool = this.createPool();
    try {
      // check credentials with first connection
      const client = await pool.connect();
      client.release();
    } catch (e) {
      await pool.end().catch(() => undefined);
      throw e;
    }
    this.pool = pool;
    this.connected = true;
    return this;
  }

  users(): UserManagerInterface {
    return new PostgresUsers((sql, params) => this.queryRows(sql, params));
  }

  disconnect(): void {
    this.connected = false;
    this.releaseConnections();
  }

  releaseConnections(): void {
    if (this.pool) {
      this.pool.end().catch((e) => console.log(e));
      this.pool = null;
    }
  }

  private createPool(): Pool {
    const sslMode = String(this.dsnOptions.params?.sslmode || '');
    const pool = new Pool({
      host: this.dsnOptions.host,
      port: this.dsnOptions.port || 5432,
      user: this.connectionData.userData.username,
      password: this.connectionData.userData.password,
      // connection is always made to one database
      database: this.dsnOptions.db || 'postgres',
      ssl: ['require', 'verify-ca', 'verify-full'].includes(sslMode) ? {rejectUnauthorized: sslMode !== 'require'} : undefined,
      max: 5,
      keepAlive: true,
      application_name: 'Flase',
    } as any);
    // idle client lost connection - pool removes it
    pool.on('error', (error) => console.log('PostgreSQL pool error', error.message));
    return pool;
  }

  private getPool(): Pool {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.pool) {
      this.pool = this.createPool();
    }
    return this.pool;
  }

  private async queryRows(sql: string, params: any[] = []): Promise<any[]> {
    return (await this.getPool().query(sql, params)).rows;
  }

  private catalog(): PostgresCatalog {
    return new PostgresCatalog({query: (text, values) => this.getPool().query(text, values)});
  }

  async openSession(database: string | null, tabId?: string): Promise<DriverSessionInterface> {
    const client = await this.getPool().connect();
    if (!this.watchedClients.has(client)) {
      this.watchedClients.add(client);
      client.on('error', (error) => console.log('PostgreSQL connection error', error.message));
    }

    const session = new PostgresSession(client, this.analyser, this.resolveFields, tabId ? () => {
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
    } catch (e) {
      client.release(e as Error);
      throw e;
    }

    if (tabId) {
      this.runningSessions.set(tabId, session);
    }
    return session;
  }

  async cancel(tabId: string): Promise<boolean> {
    const session = this.runningSessions.get(tabId);
    const processId = session?.processId;
    if (!session || !processId) {
      return false;
    }
    // import checks it between statements, pg_cancel_backend stops the running one
    session.markCancelled();
    await this.queryRows('SELECT pg_cancel_backend($1)', [processId]);
    return true;
  }

  async getProcessList(): Promise<ProcessInterface[]> {
    const ownProcesses = new Set<number>(((this.pool as any)?._clients || []).map((client: any) => client.processID));
    const rows = await this.queryRows(
      `SELECT pid, usename, client_addr, client_port, datname, state, wait_event_type, wait_event, query,
              EXTRACT(EPOCH FROM (now() - COALESCE(CASE WHEN state = 'active' THEN query_start END, state_change, backend_start)))::int AS seconds
       FROM pg_stat_activity
       WHERE backend_type = 'client backend'
       ORDER BY pid`,
    );
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

  async killProcess(id: number, connection: boolean): Promise<void> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid process id');
    }
    const [row] = await this.queryRows(connection ? 'SELECT pg_terminate_backend($1) AS done' : 'SELECT pg_cancel_backend($1) AS done', [id]);
    if (!row?.done) {
      throw new Error(`Process ${id} does not exist or it cannot be stopped by this user`);
    }
  }

  dump(options: DumpOptionsInterface, write: (text: string) => Promise<void>): Promise<{tables: number, rows: number}> {
    return new PostgresDumper(this.getPool(), options).dump(write);
  }

  buildInsertStatement(database: string, table: string, columns: string[], rows: (string | null)[][]): string {
    return `INSERT INTO ${PostgresSql.table(database, table)} (${PostgresSql.identifiers(columns)}) VALUES\n`
      + rows.map((row) => `(${row.map((value) => PostgresSql.literal(value)).join(', ')})`).join(',\n');
  }

  /** schemas of database, system schemas are at the end */
  getListOfDatabases(): Observable<DatabaseInterface> {
    return new Observable((observer) => {
      this.queryRows(
        `SELECT nspname AS name FROM pg_namespace
         WHERE nspname NOT LIKE 'pg\\_toast%' AND nspname NOT LIKE 'pg\\_temp\\_%'
         ORDER BY nspname IN ('pg_catalog', 'information_schema'), nspname`,
      ).then((rows) => {
        rows.forEach((row) => observer.next({name: row.name}));
        observer.complete();
      }).catch((error) => observer.error(error));
    });
  }

  getListOfTablesInDatabase(schema: string): Observable<TableInformationInterface> {
    return new Observable((observer) => {
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

  getSelectFromTypeFromQuery(query: string): SelectFromType[] {
    return this.analyser.getFrom(query);
  }

  async getColumnsOfTable(schema: string, selectFromType: SelectFromType): Promise<ColumnInterface[]> {
    const columns = (await this.loadColumns(schema, [selectFromType.table])).get(selectFromType.table) || [];
    if (!columns.length) {
      throw new Error(`Table ${schema}.${selectFromType.table} does not exist`);
    }
    return columns.map((column) => ({...column, table: {...column.table, alias: selectFromType.as}}));
  }

  /** columns with primary keys and references, by table name */
  private async loadColumns(schema: string, tables: string[] | null): Promise<Map<string, ColumnInterface[]>> {
    const catalog = this.catalog();
    const [columns, primaryKeys, foreignKeys] = await Promise.all([
      catalog.columns(schema, tables),
      catalog.primaryKeys(schema, tables),
      catalog.foreignKeys(schema, tables?.length === 1 ? tables[0] : null),
    ]);
    const byTable = new Map<string, ColumnInterface[]>();
    columns.forEach((column) => {
      if (!byTable.has(column.table)) {
        byTable.set(column.table, []);
        this.columnTypes.set(`${schema}.${column.table}`, new Map());
      }
      this.columnTypes.get(`${schema}.${column.table}`)!.set(column.name, column.type);
      // single column foreign key - value links to referenced row
      const key = foreignKeys.find((item) => item.table.name === column.table && item.columns.length === 1 && item.columns[0] === column.name);
      byTable.get(column.table)!.push({
        table: {databaseName: schema, name: column.table},
        autoIncrement: !!column.identity || column.serial,
        defaultValue: column.defaultLiteral ?? column.defaultExpression,
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
          table: {databaseName: key.referencedTable.databaseName, name: key.referencedTable.name},
        } : undefined,
      });
    });
    return byTable;
  }

  getEditableTableOfQuery(query: string): {table: SelectFromType | null, reason?: string} {
    return this.analyser.getEditableTable(query);
  }

  /**
   * schema, table and column of result fields - PostgreSQL describes them by oid of table and number of column.
   * Table alias is taken from query, key is `alias.name` when name repeats in result.
   */
  private resolveFields = async (fields: PgFieldInterface[], query: string): Promise<ResultFieldInterface[]> => {
    const tableIds = Array.from(new Set(fields.map((field) => field.tableID).filter((tableId) => tableId > 0)));
    const columns = new Map<string, {schema: string, table: string, column: string}>();
    if (tableIds.length) {
      const rows = await this.queryRows(
        `SELECT a.attrelid::int AS table_id, a.attnum, a.attname, c.relname, n.nspname
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE a.attrelid = ANY($1) AND a.attnum > 0`,
        [tableIds],
      );
      rows.forEach((row) => columns.set(`${row.table_id}:${row.attnum}`, {schema: row.nspname, table: row.relname, column: row.attname}));
    }

    let from: SelectFromType[] = [];
    try {
      from = this.analyser.getFrom(query);
    } catch (e) {
      // not parsable query - table names are used instead of aliases
    }
    const aliasOf = (schema: string, table: string): string => {
      const used = from.filter((item) => item.table === table && (!item.db || item.db === schema));
      return used.length === 1 && used[0].as ? used[0].as : table;
    };

    const nameCount = new Map<string, number>();
    fields.forEach((field) => nameCount.set(field.name, (nameCount.get(field.name) || 0) + 1));
    const usedKeys = new Set<string>();
    return fields.map((field, index) => {
      const source = columns.get(`${field.tableID}:${field.columnID}`);
      const alias = source ? aliasOf(source.schema, source.table) : '';
      let key = nameCount.get(field.name)! > 1 && alias ? `${alias}.${field.name}` : field.name;
      if (usedKeys.has(key)) {
        key = `${key}#${index}`;
      }
      usedKeys.add(key);
      return {
        key,
        name: field.name,
        orgName: source?.column || '',
        table: alias,
        orgTable: source?.table || '',
        db: source?.schema || '',
      };
    });
  };

  buildRowChangeStatements(table: TableInterface, changes: RowChangeInterface[]): RowChangeStatementInterface[] {
    const tableName = PostgresSql.table(table.databaseName, table.name);
    const types = this.columnTypes.get(`${table.databaseName}.${table.name}`);
    // UPDATE / DELETE have no LIMIT - one row of table without primary key is found by its physical address
    const where = (change: RowChangeInterface) => change.limitOne
      ? `ctid = (SELECT ctid FROM ${tableName} WHERE ${PostgresAdapter.buildWhere(change.where, types)} LIMIT 1)`
      : PostgresAdapter.buildWhere(change.where, types);

    return changes.map((change) => {
      switch (change.kind) {
        case 'update': {
          const entries = Object.entries(change.values || {});
          if (!entries.length) {
            throw new Error('Update without values');
          }
          const set = entries.map(([column, value]) => `${PostgresSql.identifier(column)} = ${PostgresSql.literal(value)}`).join(', ');
          return {sql: `UPDATE ${tableName} SET ${set} WHERE ${where(change)}`, expectOneRow: true};
        }
        case 'delete':
          return {sql: `DELETE FROM ${tableName} WHERE ${where(change)}`, expectOneRow: true};
        case 'insert': {
          const values = change.values || {};
          const columns = Object.keys(values);
          return {
            sql: columns.length
              ? `INSERT INTO ${tableName} (${PostgresSql.identifiers(columns)}) VALUES (${columns.map((column) => PostgresSql.literal(values[column])).join(', ')})`
              : `INSERT INTO ${tableName} DEFAULT VALUES`,
            expectOneRow: false,
          };
        }
        default:
          throw new Error(`Unknown change ${(change as RowChangeInterface).kind}`);
      }
    });
  }

  /** NULL must be compared with IS NULL, `= NULL` never matches */
  private static buildWhere(where: RowValuesType | undefined, types?: Map<string, string>): string {
    const entries = Object.entries(where || {});
    if (!entries.length) {
      // never change whole table
      throw new Error('Row cannot be identified - missing WHERE values');
    }
    return entries.map(([column, value]) => {
      const name = PostgresSql.identifier(column);
      if (value === null) {
        return `${name} IS NULL`;
      }
      return NO_EQUALITY_TYPE.test(types?.get(column) || '')
        ? `${name}::text = ${PostgresSql.literal(value)}`
        : `${name} = ${PostgresSql.literal(value)}`;
    }).join(' AND ');
  }

  async getTableStructure(table: TableInterface): Promise<TableStructureInterface> {
    const warnings: string[] = [];
    const schema = table.databaseName;
    const name = table.name;
    const catalog = this.catalog();
    // missing privileges for one part must not hide the rest
    const load = <T>(part: string, loader: Promise<T>, fallback: T): Promise<T> => loader.catch((e) => {
      warnings.push(`${part}: ${e?.message || e}`);
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
      table: {databaseName: schema, name},
      info,
      columns,
      indexes: indexes.map(({constraint, definition, ...index}) => index),
      foreignKeys,
      referencedBy,
      triggers: triggers.map(({name: triggerName, timing, event, statement}) => ({name: triggerName, timing, event, statement})),
      ddl,
      warnings,
    };
  }

  buildStructureChangeStatements(table: TableInterface, change: StructureChangeType): Promise<string[]> {
    return new PostgresDdlBuilder(this.catalog()).build(table, change);
  }

  /** DDL of PostgreSQL is transactional - all statements are executed or none */
  async executeStatements(statements: string[]): Promise<void> {
    const client = await this.getPool().connect();
    try {
      await client.query('BEGIN');
      for (let index = 0; index < statements.length; index++) {
        try {
          await client.query(statements[index]);
        } catch (e: any) {
          if (statements.length > 1) {
            e.message = `${e.message}. Statement ${index + 1} of ${statements.length} failed, nothing was changed.`;
          }
          throw e;
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  async searchDatabase(
    schema: string,
    term: string,
    mode: SearchModeType,
    onResult: (result: DatabaseSearchResultInterface) => void,
  ): Promise<{tables: number, warnings: string[]}> {
    const columns: CatalogColumnInterface[] = (await this.catalog().columns(schema, null)).filter((column) => !column.isBinary);
    const relations = await this.catalog().relations(schema);
    const tables = new Map<string, {name: string, isText: boolean}[]>();
    columns
      .filter((column) => relations.some((relation) => relation.name === column.table && ['r', 'p'].includes(relation.kind)))
      .forEach((column) => {
        if (!tables.has(column.table)) tables.set(column.table, []);
        tables.get(column.table)!.push({name: column.name, isText: /^(varchar|char|text|citext|name)(\(\d+\))?$/i.test(column.type)});
      });
    // other types are compared as text - LIKE on number / date / json does not exist
    const searched = (column: {name: string, isText: boolean}) => column.isText
      ? PostgresSql.identifier(column.name)
      : `${PostgresSql.identifier(column.name)}::text`;

    // case insensitive as in MySQL, LIKE wildcards in term are searched literally
    const pattern = PostgresSql.literal(mode === 'exact' ? term : `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
    const operator = mode === 'exact' ? '=' : 'ILIKE';
    const warnings: string[] = [];

    for (const [table, tableColumns] of Array.from(tables.entries())) {
      const counts = tableColumns.map((column, index) => `COUNT(*) FILTER (WHERE ${searched(column)} ${operator} ${pattern}) AS c${index}`).join(', ');
      const where = tableColumns.map((column) => `${searched(column)} ${operator} ${pattern}`).join(' OR ');
      try {
        const [row] = await this.queryRows(`SELECT COUNT(*) AS total, ${counts} FROM ${PostgresSql.table(schema, table)} WHERE ${where}`);
        const rows = Number(row.total);
        if (rows > 0) {
          onResult({
            table,
            rows,
            columns: tableColumns
              .map((column, index) => ({name: column.name, rows: Number(row[`c${index}`]), text: column.isText}))
              .filter((column) => column.rows > 0),
          });
        }
      } catch (e: any) {
        warnings.push(`${table}: ${e?.message || e}`);
      }
    }

    return {tables: tables.size, warnings};
  }
}

export default PostgresAdapter;
