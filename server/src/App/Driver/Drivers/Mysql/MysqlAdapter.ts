import DriverInterface from '../../DriverInterface';
import DatabaseInterface from '../../Interface/Data/DatabaseInterface';
import {Observable} from 'rxjs';
import {MysqlError, Pool, PoolConnection} from 'mysql';
import RecordType from '../../../../Driver/Type/Data/RecordType';
import ColumnInterface from '../../Interface/Data/ColumnInterface';
import SelectFromType from '../../../../Driver/Type/Data/SelectFromType';
import MysqlColumnReference from './Type/MysqlColumnReference';
import ReferenceTableInterface from '../../Interface/Data/ReferenceTableInterface';
import TableInformationInterface from '../../Interface/Data/TableInformationInterface';
import ConnectionRequestInterface from '../../../Connection/Interface/ConnectionRequestInterface';
import {ParsedDsn} from '@soluble/dsn-parser';
import DriverSessionInterface from '../../DriverSessionInterface';
import MysqlSession from './MysqlSession';
import MysqlDdlBuilder from './MysqlDdlBuilder';
import ProcessInterface from '../../Interface/Data/ProcessInterface';
import MysqlDumper from './MysqlDumper';
import {DumpOptionsInterface} from '../../Interface/Data/TransferInterface';
import {StructureChangeType} from '../../Interface/Data/StructureChangeInterface';
import {DatabaseSearchResultInterface, SearchModeType} from '../../Interface/Data/DatabaseSearchInterface';
import TableInterface from '../../Interface/Data/TableInterface';
import RowChangeInterface, {RowValuesType} from '../../Interface/Data/RowChangeInterface';
import RowChangeStatementInterface from '../../Interface/Data/RowChangeStatementInterface';
import TableStructureInterface, {
  StructureColumnInterface,
  StructureForeignKeyInterface,
  StructureIndexInterface,
  StructureTableInfoInterface,
  StructureTriggerInterface,
} from '../../Interface/Data/TableStructureInterface';
const mysql = require('mysql');
const { Parser } = require('node-sql-parser');

class MysqlAdapter implements DriverInterface {
  private consoleLog = true;
  private pool: Pool | null = null;
  /** credentials were verified and disconnect was not called */
  private connected = false;
  private keepaliveIntervalId: NodeJS.Timeout | null = null;
  private connectionData: ConnectionRequestInterface;
  private parser: typeof Parser;
  private dsnOptions: ParsedDsn;

  constructor(connectionData: ConnectionRequestInterface, dsnOptions: ParsedDsn) {
    this.connectionData = connectionData;
    this.parser = new Parser();
    this.dsnOptions = dsnOptions;
  }

  connect(): Promise<DriverInterface> {
    const pool = this.createPool();

    // check credentials with first connection
    return new Promise((resolve, reject) => {
      pool.getConnection((err: MysqlError, connection: PoolConnection) => {
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

  disconnect(): void {
    this.connected = false;
    if (this.keepaliveIntervalId) {
      clearInterval(this.keepaliveIntervalId);
      this.keepaliveIntervalId = null;
    }
    this.releaseConnections();
  }

  releaseConnections(): void {
    if (this.pool) {
      this.pool.end((err) => err && this.log(err));
      this.pool = null;
    }
  }

  private createPool(): Pool {
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

  /** sessions running for tabs - cancel kills their query */
  private readonly runningSessions = new Map<string, MysqlSession>();

  openSession(database: string | null, tabId?: string): Promise<DriverSessionInterface> {
    return new Promise((resolve, reject) => {
      this.getPool().getConnection((err: MysqlError, connection: PoolConnection) => {
        if (err) {
          reject(err);
          return;
        }

        const createSession = () => {
          const session = new MysqlSession(connection, this.parser, tabId ? () => {
            if (this.runningSessions.get(tabId) === session) {
              this.runningSessions.delete(tabId);
            }
          } : undefined);
          if (tabId) {
            this.runningSessions.set(tabId, session);
          }
          return session;
        };

        const done = (useErr: MysqlError | null | undefined) => {
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

  async cancel(tabId: string): Promise<boolean> {
    const session = this.runningSessions.get(tabId);
    const threadId = session?.threadId;
    if (!session || !threadId) {
      return false;
    }
    // import checks it between statements, KILL stops the running one
    session.markCancelled();
    // must run on other connection - the session connection is busy with the query
    await this.queryRows('KILL QUERY ?', [threadId]);
    return true;
  }

  async getProcessList(): Promise<ProcessInterface[]> {
    const ownThreads = new Set<number>(((this.pool as any)?._allConnections || []).map((connection: any) => connection.threadId));
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

  dump(options: DumpOptionsInterface, write: (text: string) => Promise<void>): Promise<{tables: number, rows: number}> {
    return new MysqlDumper(this.getPool(), options).dump(write);
  }

  buildInsertStatement(database: string, table: string, columns: string[], rows: (string | null)[][]): string {
    return mysql.format('INSERT INTO ??.?? (??) VALUES ?', [database, table, columns, rows]);
  }

  async killProcess(id: number, connection: boolean): Promise<void> {
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('Invalid process id');
    }
    await this.queryRows(connection ? 'KILL CONNECTION ?' : 'KILL QUERY ?', [id]);
  }

  getListOfDatabases():Observable<DatabaseInterface> {
    const query = 'SHOW DATABASES';
    return new Observable(observer => {
      this.streamQueryResults(query).subscribe({
        next: (record) => observer.next({name: `${record.Database}`}),
        error: (error) => observer.error(error),
        complete: () => observer.complete(),
      });
    });
  }

  getListOfTablesInDatabase(databaseName:string): Observable<TableInformationInterface> {
    const showTablesQuery = mysql.format('SHOW TABLES FROM ??', [databaseName]);
    this.log('Show tables');

    return new Observable(observer => {
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

            this.getPool().query(showKeysFromTableQuery, (err: MysqlError | null, keysRecords: RecordType[]) => {
              if (err) {
                observer.error(err);
                return;
              }

              this.getColumnsOfTable(databaseName, {table: tableName}).then((columnsOfTable) => {
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

  getSelectFromTypeFromQuery(query:string): SelectFromType[]
  {
    const ast = this.parser.astify(query);
    const statement = Array.isArray(ast) ? ast[0] : ast;
    return statement?.from || [];
  }

  getColumnsOfTable(databaseName: string, selectFromType:SelectFromType): Promise<ColumnInterface[]> {
    const showColumnsQuery = mysql.format('SHOW COLUMNS FROM ??.??', [databaseName, selectFromType.table]);

    return new Promise((resolve, reject) => {
      this.getPool().query(showColumnsQuery, (err: MysqlError | null, columns: any) => {
        if (err) {
          reject(err);
          return;
        }

        this.getReferencesColumns(databaseName, selectFromType.table).then((referencesResult) => {
          const newColumns: ColumnInterface[] = [];

          columns.forEach((column:any) => {
            const reference = this.findReference(column.Field, referencesResult);
            const type = `${column.Type}`;
            const columnType:ColumnInterface = {
              table: {databaseName, name: selectFromType.table, alias: selectFromType.as},
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
            }
            newColumns.push(columnType);
          });

          resolve(newColumns);
        }).catch(reject);
      });
    });
  }

  getEditableTableOfQuery(query: string): {table: SelectFromType | null, reason?: string} {
    let parsed;
    try {
      parsed = this.parser.astify(query);
    } catch (e) {
      return {table: null, reason: 'Query could not be analysed'};
    }

    const statements = Array.isArray(parsed) ? parsed : [parsed];
    const ast = statements[0];
    if (statements.length !== 1 || ast?.type !== 'select') {
      return {table: null, reason: 'Only single SELECT result can be edited'};
    }
    if (ast._next || ast.union) {
      return {table: null, reason: 'Result of UNION cannot be edited'};
    }
    if (ast.with) {
      return {table: null, reason: 'Result of WITH query cannot be edited'};
    }
    if (!ast.from?.length) {
      return {table: null, reason: 'Result does not come from a table'};
    }
    if (ast.from.length > 1) {
      return {table: null, reason: 'Result comes from more tables (JOIN)'};
    }
    if (!ast.from[0].table || ast.from[0].expr) {
      return {table: null, reason: 'Result comes from sub query'};
    }
    const groupBy = Array.isArray(ast.groupby) ? ast.groupby : ast.groupby?.columns;
    if (ast.distinct || groupBy?.length || ast.having) {
      return {table: null, reason: 'Grouped or DISTINCT result cannot be edited'};
    }
    const columns = Array.isArray(ast.columns) ? ast.columns : [];
    if (columns.some((column: any) => column?.expr?.type === 'aggr_func')) {
      return {table: null, reason: 'Aggregated result cannot be edited'};
    }

    return {table: ast.from[0]};
  }

  buildRowChangeStatements(table: TableInterface, changes: RowChangeInterface[]): RowChangeStatementInterface[] {
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
          throw new Error(`Unknown change ${(change as RowChangeInterface).kind}`);
      }
    });
  }

  async getTableStructure(table: TableInterface): Promise<TableStructureInterface> {
    const warnings: string[] = [];
    const db = table.databaseName;
    const name = table.name;
    // missing privileges for one part must not hide the rest
    const load = <T>(part: string, loader: Promise<T>, fallback: T): Promise<T> => loader.catch((e) => {
      warnings.push(`${part}: ${e?.sqlMessage || e?.message || e}`);
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

    return {table: {databaseName: db, name}, info, columns, indexes, foreignKeys, referencedBy, triggers, ddl, warnings};
  }

  async buildStructureChangeStatements(table: TableInterface, change: StructureChangeType): Promise<string[]> {
    // generated columns cannot be inserted - copy only real columns
    const copyColumns = change.kind === 'copy' && change.withData
      ? (await this.loadStructureColumns(table.databaseName, table.name))
        .filter((column) => !column.generationExpression)
        .map((column) => column.name)
      : undefined;
    return MysqlDdlBuilder.build(table, change, copyColumns);
  }

  async searchDatabase(
    database: string,
    term: string,
    mode: SearchModeType,
    onResult: (result: DatabaseSearchResultInterface) => void,
  ): Promise<{tables: number, warnings: string[]}> {
    // binary and spatial columns are not searched as text
    const columns = await this.queryRows(
      `SELECT c.\`TABLE_NAME\`, c.\`COLUMN_NAME\`, c.\`DATA_TYPE\`
       FROM \`information_schema\`.\`COLUMNS\` c
       JOIN \`information_schema\`.\`TABLES\` t ON t.\`TABLE_SCHEMA\` = c.\`TABLE_SCHEMA\` AND t.\`TABLE_NAME\` = c.\`TABLE_NAME\`
       WHERE c.\`TABLE_SCHEMA\` = ? AND t.\`TABLE_TYPE\` = 'BASE TABLE'
         AND c.\`DATA_TYPE\` NOT IN ('blob', 'tinyblob', 'mediumblob', 'longblob', 'binary', 'varbinary', 'bit',
           'geometry', 'point', 'linestring', 'polygon', 'multipoint', 'multilinestring', 'multipolygon', 'geometrycollection')
       ORDER BY c.\`TABLE_NAME\`, c.\`ORDINAL_POSITION\``,
      [database],
    );

    const tables = new Map<string, {name: string, isText: boolean}[]>();
    columns.forEach((row) => {
      if (!tables.has(row.TABLE_NAME)) tables.set(row.TABLE_NAME, []);
      tables.get(row.TABLE_NAME)!.push({
        name: row.COLUMN_NAME,
        isText: /char|text|enum|set|json/i.test(row.DATA_TYPE),
      });
    });
    // numbers and dates are compared as text - otherwise 'abc' = 0 matches and invalid date fails the query
    const searched = (column: {name: string, isText: boolean}) => column.isText
      ? mysql.escapeId(column.name)
      : `CAST(${mysql.escapeId(column.name)} AS CHAR)`;

    // LIKE wildcards in term are searched literally
    const pattern = mode === 'exact' ? term : `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const operator = mode === 'exact' ? '=' : 'LIKE';
    const warnings: string[] = [];

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
              .map((column, index) => ({name: column.name, rows: Number(row[`c${index}`]), text: column.isText}))
              .filter((column) => column.rows > 0),
          });
        }
      } catch (e: any) {
        warnings.push(`${table}: ${e?.sqlMessage || e?.message || e}`);
      }
    }

    return {tables: tables.size, warnings};
  }

  async executeStatements(statements: string[]): Promise<void> {
    for (let index = 0; index < statements.length; index++) {
      try {
        await this.queryRows(statements[index]);
      } catch (e: any) {
        // DDL is committed immediately - tell which statements were already executed
        if (statements.length > 1 && e?.sqlMessage) {
          e.sqlMessage = `${e.sqlMessage}. Executed ${index} of ${statements.length} statements.`;
        }
        throw e;
      }
    }
  }

  private queryRows(sql: string, params: any[] = []): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.getPool().query(sql, params, (err: MysqlError | null, rows: any[]) => err ? reject(err) : resolve(rows));
    });
  }

  private static toNumber(value: any): number | null {
    return value === null || value === undefined ? null : Number(value);
  }

  private async loadTableInfo(db: string, name: string): Promise<StructureTableInfoInterface | null> {
    const rows = await this.queryRows(
      `SELECT \`TABLE_TYPE\`, \`ENGINE\`, \`TABLE_COLLATION\`, \`ROW_FORMAT\`, \`TABLE_ROWS\`, \`DATA_LENGTH\`,
              \`INDEX_LENGTH\`, \`AUTO_INCREMENT\`, \`TABLE_COMMENT\`, \`CREATE_TIME\`, \`UPDATE_TIME\`
       FROM \`information_schema\`.\`TABLES\` WHERE \`TABLE_SCHEMA\` = ? AND \`TABLE_NAME\` = ?`,
      [db, name],
    );
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
  private async loadStructureColumns(db: string, name: string): Promise<StructureColumnInterface[]> {
    const [rows, schemaRows, isMariaDb] = await Promise.all([
      this.queryRows('SHOW FULL COLUMNS FROM ??.??', [db, name]),
      this.queryRows(
        'SELECT `COLUMN_NAME`, `COLUMN_DEFAULT`, `GENERATION_EXPRESSION` FROM `information_schema`.`COLUMNS` WHERE `TABLE_SCHEMA` = ? AND `TABLE_NAME` = ?',
        [db, name],
      ),
      this.isMariaDb(),
    ]);
    const schemaColumns = new Map(schemaRows.map((row) => [row.COLUMN_NAME, row]));

    return rows.map((row) => ({
      name: row.Field,
      type: row.Type,
      nullable: row.Null === 'YES',
      defaultValue: row.Default === undefined ? null : row.Default,
      defaultIsExpression: MysqlAdapter.isDefaultExpression(row, schemaColumns.get(row.Field)?.COLUMN_DEFAULT, isMariaDb),
      generationExpression: schemaColumns.get(row.Field)?.GENERATION_EXPRESSION || null,
      extra: row.Extra || '',
      comment: row.Comment || '',
      collation: row.Collation,
      key: row.Key || '',
    }));
  }

  /**
   * MySQL marks expression defaults with DEFAULT_GENERATED.
   * MariaDB quotes literal strings in information_schema, expressions are not quoted.
   */
  private static isDefaultExpression(row: any, schemaDefault: string | null | undefined, isMariaDb: boolean): boolean {
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

  private mariaDb: Promise<boolean> | null = null;

  /** server flavor, read once per connection */
  private isMariaDb(): Promise<boolean> {
    if (!this.mariaDb) {
      this.mariaDb = this.queryRows('SELECT VERSION() AS `version`')
        .then((rows) => /mariadb/i.test(rows[0]?.version || ''))
        .catch(() => {
          this.mariaDb = null;
          return false;
        });
    }
    return this.mariaDb;
  }

  private async loadIndexes(db: string, name: string): Promise<StructureIndexInterface[]> {
    const rows = await this.queryRows('SHOW INDEX FROM ??.??', [db, name]);
    const indexes = new Map<string, StructureIndexInterface>();
    rows.forEach((row) => {
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
      indexes.get(row.Key_name)!.columns.push({
        // functional index (MySQL 8) has expression instead of column
        name: row.Column_name ?? `(${row.Expression})`,
        subPart: MysqlAdapter.toNumber(row.Sub_part),
        descending: row.Collation === 'D',
      });
    });
    return Array.from(indexes.values());
  }

  private async loadForeignKeys(where: string, db: string, name: string): Promise<StructureForeignKeyInterface[]> {
    const rows = await this.queryRows(
      `SELECT k.\`CONSTRAINT_NAME\`, k.\`TABLE_SCHEMA\`, k.\`TABLE_NAME\`, k.\`COLUMN_NAME\`,
              k.\`REFERENCED_TABLE_SCHEMA\`, k.\`REFERENCED_TABLE_NAME\`, k.\`REFERENCED_COLUMN_NAME\`,
              r.\`UPDATE_RULE\`, r.\`DELETE_RULE\`
       FROM \`information_schema\`.\`KEY_COLUMN_USAGE\` k
       JOIN \`information_schema\`.\`REFERENTIAL_CONSTRAINTS\` r
         ON r.\`CONSTRAINT_SCHEMA\` = k.\`CONSTRAINT_SCHEMA\` AND r.\`CONSTRAINT_NAME\` = k.\`CONSTRAINT_NAME\` AND r.\`TABLE_NAME\` = k.\`TABLE_NAME\`
       WHERE ${where} AND k.\`REFERENCED_TABLE_NAME\` IS NOT NULL
       ORDER BY k.\`TABLE_SCHEMA\`, k.\`TABLE_NAME\`, k.\`CONSTRAINT_NAME\`, k.\`ORDINAL_POSITION\``,
      [db, name],
    );
    const keys = new Map<string, StructureForeignKeyInterface>();
    rows.forEach((row) => {
      const id = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}.${row.CONSTRAINT_NAME}`;
      if (!keys.has(id)) {
        keys.set(id, {
          name: row.CONSTRAINT_NAME,
          table: {databaseName: row.TABLE_SCHEMA, name: row.TABLE_NAME},
          columns: [],
          referencedTable: {databaseName: row.REFERENCED_TABLE_SCHEMA, name: row.REFERENCED_TABLE_NAME},
          referencedColumns: [],
          onUpdate: row.UPDATE_RULE,
          onDelete: row.DELETE_RULE,
        });
      }
      keys.get(id)!.columns.push(row.COLUMN_NAME);
      keys.get(id)!.referencedColumns.push(row.REFERENCED_COLUMN_NAME);
    });
    return Array.from(keys.values());
  }

  private async loadTriggers(db: string, name: string): Promise<StructureTriggerInterface[]> {
    const rows = await this.queryRows(
      `SELECT \`TRIGGER_NAME\`, \`ACTION_TIMING\`, \`EVENT_MANIPULATION\`, \`ACTION_STATEMENT\`
       FROM \`information_schema\`.\`TRIGGERS\` WHERE \`EVENT_OBJECT_SCHEMA\` = ? AND \`EVENT_OBJECT_TABLE\` = ?
       ORDER BY \`EVENT_MANIPULATION\`, \`ACTION_TIMING\`, \`ACTION_ORDER\``,
      [db, name],
    );
    return rows.map((row) => ({
      name: row.TRIGGER_NAME,
      timing: row.ACTION_TIMING,
      event: row.EVENT_MANIPULATION,
      statement: row.ACTION_STATEMENT,
    }));
  }

  private async loadDdl(db: string, name: string): Promise<string> {
    const rows = await this.queryRows('SHOW CREATE TABLE ??.??', [db, name]);
    return rows[0]?.['Create Table'] || rows[0]?.['Create View'] || '';
  }

  /** NULL must be compared with IS NULL, `= NULL` never matches */
  private static buildWhere(where?: RowValuesType): string {
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
  private static parseEnumValues(type: string): string[] | undefined {
    const match = /^enum\((.*)\)$/i.exec(type);
    if (!match) {
      return undefined;
    }
    const values: string[] = [];
    const valueRegex = /'((?:[^']|'')*)'/g;
    let item;
    while ((item = valueRegex.exec(match[1])) !== null) {
      values.push(item[1].replace(/''/g, "'"));
    }
    return values;
  }

  /** binary values are not sent to client in editable form */
  private static isEditableType(type: string): boolean {
    return !/blob|binary|^bit|geometry|point|linestring|polygon/i.test(type);
  }

  /** pool is opened again after releaseConnections */
  private getPool(): Pool {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    if (!this.pool) {
      this.pool = this.createPool();
    }
    return this.pool;
  }

  private streamQueryResults = (query:string):Observable<RecordType> => {
    this.log(`Query Stream: ${query}`);

    return new Observable(observer => {
      this.getPool().query(query)
        .on('error', (error: MysqlError) => observer.error(error))
        .on('result', (row: RecordType) => observer.next(row))
        // 'end' is emitted also after error - complete is then ignored by rxjs
        .on('end', () => observer.complete());
    });
  }

  private getReferencesColumns(databaseName:string, tableName:string):Promise<ReferenceTableInterface[]> {
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
      this.getPool().query(sql, [databaseName, tableName], (err: MysqlError | null, results: MysqlColumnReference[]) => {
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
          }
        });

        resolve(converted);
      });
    });
  }

  private findReference(columnName:string, references:ReferenceTableInterface[]):undefined|ReferenceTableInterface {
    return references.find((reference) => reference.originColumnName === columnName);
  }

  private preparePrimaryColumns = (columnsOfTable: ColumnInterface[], records: RecordType[]): ColumnInterface[] => {
    return columnsOfTable.filter((tableColumn) => records.some((record) => {
      return record.Column_name === tableColumn.name && record.Key_name === 'PRIMARY';
    }));
  }

  private log(input:any): void {
    if (this.consoleLog) {
      if(typeof input === 'string') {
        console.log(`\x1b[33m ${input} \x1b[0m`);
      } else {
        console.log(input);
      }
    }
  }

  private keepalive = () => {
    // released pool is not opened just for keepalive
    if (!this.pool) {
      return;
    }
    try {
      this.pool.query('SELECT 1 + 1 AS solution', (err: MysqlError | null) => {
        if (err) {
          console.log(err.code); // 'ER_BAD_DB_ERROR'
        }
      });
    } catch (e) {
      console.log(e);
    }
  }
}

export default MysqlAdapter;
