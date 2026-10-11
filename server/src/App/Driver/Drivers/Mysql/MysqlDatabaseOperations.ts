import {
  DatabaseEventInterface,
  DatabaseObjectsInterface,
  DatabaseRoutineInterface,
  ObjectRefInterface,
  ServerOptionsInterface,
} from '../../Interface/Data/DatabaseObjectsInterface';
import {DatabaseOperationType, MaintenanceActionType} from '../../Interface/Data/DatabaseOperationInterface';
import MysqlDdlBuilder from './MysqlDdlBuilder';
import SqlText from '../../Query/SqlText';
const mysql = require('mysql');

type QueryRowsType = (sql: string, params?: any[]) => Promise<any[]>;

/** databases of server itself - they are never dropped or renamed from here */
const SYSTEM_DATABASES = ['mysql', 'information_schema', 'performance_schema', 'sys'];

const OBJECT_TYPES = ['PROCEDURE', 'FUNCTION', 'TRIGGER', 'EVENT', 'VIEW'];

const MAINTENANCE: {[action in MaintenanceActionType]?: string} = {
  optimize: 'OPTIMIZE TABLE',
  analyze: 'ANALYZE TABLE',
  check: 'CHECK TABLE',
  repair: 'REPAIR TABLE',
};

/**
 * Objects of database and operations on databases, more tables, views, routines, triggers and events (MySQL / MariaDB).
 * @author Mateusz Bochen
 */
class MysqlDatabaseOperations {
  /** queryStats - query of current sizes and row counts of tables */
  constructor(private readonly queryRows: QueryRowsType, private readonly queryStats: QueryRowsType = queryRows) {
  }

  async getDatabaseObjects(database: string): Promise<DatabaseObjectsInterface> {
    const warnings: string[] = [];
    // missing privileges for one part must not hide the rest
    const load = <T>(part: string, loader: Promise<T>, fallback: T): Promise<T> => loader.catch((e) => {
      warnings.push(`${part}: ${e?.sqlMessage || e?.message || e}`);
      return fallback;
    });

    const [schema] = await this.queryRows(
      'SELECT `DEFAULT_COLLATION_NAME` FROM `information_schema`.`SCHEMATA` WHERE `SCHEMA_NAME` = ?',
      [database],
    );
    if (!schema) {
      throw new Error(`Database ${database} does not exist`);
    }

    const [tables, routines, parameters, triggers, events, scheduler] = await Promise.all([
      load('Tables', this.queryStats(
        `SELECT \`TABLE_NAME\`, \`TABLE_TYPE\`, \`ENGINE\`, \`TABLE_COLLATION\`, \`TABLE_ROWS\`, \`DATA_LENGTH\`, \`INDEX_LENGTH\`, \`TABLE_COMMENT\`
         FROM \`information_schema\`.\`TABLES\` WHERE \`TABLE_SCHEMA\` = ? ORDER BY \`TABLE_NAME\``,
        [database],
      ), []),
      load('Routines', this.queryRows(
        `SELECT \`ROUTINE_NAME\`, \`ROUTINE_TYPE\`, \`DTD_IDENTIFIER\`, \`ROUTINE_COMMENT\`, \`EXTERNAL_LANGUAGE\`
         FROM \`information_schema\`.\`ROUTINES\` WHERE \`ROUTINE_SCHEMA\` = ? ORDER BY \`ROUTINE_TYPE\` DESC, \`ROUTINE_NAME\``,
        [database],
      ), []),
      load('Parameters', this.queryRows(
        `SELECT \`SPECIFIC_NAME\`, \`ROUTINE_TYPE\`, \`PARAMETER_MODE\`, \`PARAMETER_NAME\`, \`DTD_IDENTIFIER\`
         FROM \`information_schema\`.\`PARAMETERS\` WHERE \`SPECIFIC_SCHEMA\` = ? AND \`ORDINAL_POSITION\` > 0
         ORDER BY \`SPECIFIC_NAME\`, \`ORDINAL_POSITION\``,
        [database],
      ), []),
      load('Triggers', this.queryRows(
        `SELECT \`TRIGGER_NAME\`, \`EVENT_OBJECT_TABLE\`, \`ACTION_TIMING\`, \`EVENT_MANIPULATION\`
         FROM \`information_schema\`.\`TRIGGERS\` WHERE \`TRIGGER_SCHEMA\` = ? ORDER BY \`EVENT_OBJECT_TABLE\`, \`TRIGGER_NAME\``,
        [database],
      ), []),
      load('Events', this.queryRows(
        `SELECT \`EVENT_NAME\`, \`STATUS\`, \`EVENT_TYPE\`, \`EXECUTE_AT\`, \`INTERVAL_VALUE\`, \`INTERVAL_FIELD\`, \`STARTS\`, \`ENDS\`,
                \`LAST_EXECUTED\`, \`EVENT_COMMENT\`
         FROM \`information_schema\`.\`EVENTS\` WHERE \`EVENT_SCHEMA\` = ? ORDER BY \`EVENT_NAME\``,
        [database],
      ), []),
      load('Event scheduler', this.queryRows('SELECT @@event_scheduler AS `scheduler`'), []),
    ]);

    const toNumber = (value: any): number | null => value === null || value === undefined ? null : Number(value);
    const parametersOf = (routine: any) => parameters
      .filter((parameter) => parameter.SPECIFIC_NAME === routine.ROUTINE_NAME && parameter.ROUTINE_TYPE === routine.ROUTINE_TYPE)
      .map((parameter) => ({mode: parameter.PARAMETER_MODE || 'IN', name: parameter.PARAMETER_NAME, type: parameter.DTD_IDENTIFIER}));

    return {
      database,
      collation: schema.DEFAULT_COLLATION_NAME,
      tables: tables.map((row) => {
        const isView = /VIEW/i.test(row.TABLE_TYPE);
        return {
          name: row.TABLE_NAME,
          type: row.TABLE_TYPE,
          isView,
          engine: row.ENGINE,
          collation: row.TABLE_COLLATION,
          rows: isView ? null : toNumber(row.TABLE_ROWS),
          dataLength: isView ? null : toNumber(row.DATA_LENGTH),
          indexLength: isView ? null : toNumber(row.INDEX_LENGTH),
          // MySQL writes VIEW as comment of views
          comment: isView ? '' : row.TABLE_COMMENT || '',
        };
      }),
      routines: routines.map((row): DatabaseRoutineInterface => ({
        kind: row.ROUTINE_TYPE === 'FUNCTION' ? 'FUNCTION' : 'PROCEDURE',
        name: row.ROUTINE_NAME,
        signature: '',
        parameters: parametersOf(row),
        returns: row.ROUTINE_TYPE === 'FUNCTION' ? row.DTD_IDENTIFIER : null,
        language: row.EXTERNAL_LANGUAGE || 'SQL',
        comment: row.ROUTINE_COMMENT || '',
      })),
      triggers: triggers.map((row) => ({
        name: row.TRIGGER_NAME,
        table: row.EVENT_OBJECT_TABLE,
        timing: row.ACTION_TIMING,
        event: row.EVENT_MANIPULATION,
      })),
      events: events.map((row): DatabaseEventInterface => ({
        name: row.EVENT_NAME,
        status: row.STATUS,
        schedule: row.EVENT_TYPE === 'ONE TIME'
          ? `AT ${row.EXECUTE_AT}`
          : `EVERY ${row.INTERVAL_VALUE} ${row.INTERVAL_FIELD}${row.STARTS ? ` STARTS ${row.STARTS}` : ''}${row.ENDS ? ` ENDS ${row.ENDS}` : ''}`,
        lastExecuted: row.LAST_EXECUTED || null,
        comment: row.EVENT_COMMENT || '',
      })),
      eventScheduler: scheduler[0]?.scheduler ?? null,
      warnings,
    };
  }

  async getServerOptions(): Promise<ServerOptionsInterface> {
    const [collations, engines, server] = await Promise.all([
      this.queryRows(
        `SELECT \`COLLATION_NAME\`, \`CHARACTER_SET_NAME\`, \`IS_DEFAULT\` FROM \`information_schema\`.\`COLLATIONS\`
         WHERE \`CHARACTER_SET_NAME\` IS NOT NULL ORDER BY \`CHARACTER_SET_NAME\`, \`COLLATION_NAME\``,
      ),
      this.queryRows(
        "SELECT `ENGINE`, `SUPPORT` FROM `information_schema`.`ENGINES` WHERE `SUPPORT` IN ('YES', 'DEFAULT') ORDER BY `ENGINE`",
      ),
      this.queryRows('SELECT @@collation_server AS `collation`'),
    ]);
    return {
      collations: collations.map((row) => ({name: row.COLLATION_NAME, charset: row.CHARACTER_SET_NAME, isDefault: /yes/i.test(row.IS_DEFAULT || '')})),
      engines: engines.map((row) => ({name: row.ENGINE, isDefault: row.SUPPORT === 'DEFAULT'})),
      defaultCollation: server[0]?.collation || null,
    };
  }

  async getObjectDdl(database: string, object: ObjectRefInterface): Promise<string> {
    const type = MysqlDatabaseOperations.objectType(object);
    const field: {[type: string]: string} = {
      PROCEDURE: 'Create Procedure',
      FUNCTION: 'Create Function',
      TRIGGER: 'SQL Original Statement',
      EVENT: 'Create Event',
      VIEW: 'Create View',
    };
    const [row] = await this.queryRows(`SHOW CREATE ${type} ??.??`, [database, MysqlDdlBuilder.requireName(object.name, 'Name')]);
    const ddl = row?.[field[type]];
    if (!ddl) {
      throw new Error(`Definition of ${type.toLowerCase()} ${object.name} is not visible - it needs to be its definer or to have privileges to see it`);
    }
    return String(ddl);
  }

  /** charset of collation - CONVERT TO CHARACTER SET needs both */
  async charsetOf(collation: string): Promise<string> {
    const [row] = await this.queryRows(
      'SELECT `CHARACTER_SET_NAME` FROM `information_schema`.`COLLATIONS` WHERE `COLLATION_NAME` = ?',
      [MysqlDdlBuilder.word(collation, 'Collation')],
    );
    if (!row?.CHARACTER_SET_NAME) {
      throw new Error(`Unknown collation ${collation}`);
    }
    return row.CHARACTER_SET_NAME;
  }

  async build(operation: DatabaseOperationType): Promise<string[]> {
    switch (operation.kind) {
      case 'createDatabase': {
        const collation = operation.collation ? ` COLLATE ${MysqlDdlBuilder.word(operation.collation, 'Collation')}` : '';
        return [`CREATE DATABASE ${MysqlDatabaseOperations.database(operation.name)}${collation}`];
      }
      case 'alterDatabase': {
        const name = MysqlDatabaseOperations.database(operation.name);
        const collation = MysqlDdlBuilder.word(operation.collation, 'Collation');
        const statements = [`ALTER DATABASE ${name} COLLATE ${collation}`];
        if (operation.convertTables) {
          const charset = await this.charsetOf(collation);
          (await this.baseTables(operation.name)).forEach((table) => {
            statements.push(`ALTER TABLE ${name}.${mysql.escapeId(table)} CONVERT TO CHARACTER SET ${charset} COLLATE ${collation}`);
          });
        }
        return statements;
      }
      case 'renameDatabase':
        return this.renameDatabase(operation.name, operation.newName);
      case 'dropDatabase':
        MysqlDatabaseOperations.notSystem(operation.name);
        return [`DROP DATABASE ${MysqlDatabaseOperations.database(operation.name)}`];
      case 'createTable':
        return [MysqlDatabaseOperations.createTable(operation)];
      case 'tables':
        return this.tablesOperation(operation);
      case 'maintenance': {
        const command = MAINTENANCE[operation.action];
        if (!command) {
          throw new Error(`${operation.action} is not available in MySQL / MariaDB`);
        }
        return [`${command} ${MysqlDatabaseOperations.tableList(operation.database, operation.tables)}`];
      }
      case 'createView': {
        const select = SqlText.singleStatement(operation.select, 'mysql', 'SELECT of view');
        const view = MysqlDdlBuilder.tableName({databaseName: operation.database, name: operation.name});
        return [`CREATE ${operation.replace ? 'OR REPLACE ' : ''}VIEW ${view} AS\n${select}`];
      }
      case 'objectDdl': {
        const sql = SqlText.createStatement(operation.sql, 'mysql');
        if (!operation.replace) {
          return [sql];
        }
        const type = MysqlDatabaseOperations.objectType(operation.replace);
        return [`DROP ${type} IF EXISTS ${MysqlDatabaseOperations.objectName(operation.database, operation.replace)}`, sql];
      }
      case 'dropObject': {
        const type = MysqlDatabaseOperations.objectType(operation.object);
        return [`DROP ${type} ${MysqlDatabaseOperations.objectName(operation.database, operation.object)}`];
      }
      default:
        throw new Error(`Unknown operation ${(operation as DatabaseOperationType).kind}`);
    }
  }

  /**
   * MySQL has no RENAME DATABASE - new database is created, tables are moved by one RENAME TABLE and old database is dropped.
   * Views, routines, triggers and events cannot be moved this way.
   */
  private async renameDatabase(name: string, newName: string): Promise<string[]> {
    MysqlDatabaseOperations.notSystem(name);
    const target = MysqlDatabaseOperations.database(newName);
    if (newName.trim() === name.trim()) {
      throw new Error('New name is the same');
    }
    const [schema] = await this.queryRows('SELECT `DEFAULT_COLLATION_NAME` FROM `information_schema`.`SCHEMATA` WHERE `SCHEMA_NAME` = ?', [name]);
    if (!schema) {
      throw new Error(`Database ${name} does not exist`);
    }
    const [views, routines, triggers, events] = await Promise.all([
      this.queryRows('SELECT `TABLE_NAME` AS `name` FROM `information_schema`.`VIEWS` WHERE `TABLE_SCHEMA` = ?', [name]),
      this.queryRows('SELECT CONCAT(LOWER(`ROUTINE_TYPE`), \' \', `ROUTINE_NAME`) AS `name` FROM `information_schema`.`ROUTINES` WHERE `ROUTINE_SCHEMA` = ?', [name]),
      this.queryRows('SELECT `TRIGGER_NAME` AS `name` FROM `information_schema`.`TRIGGERS` WHERE `TRIGGER_SCHEMA` = ?', [name]),
      this.queryRows('SELECT `EVENT_NAME` AS `name` FROM `information_schema`.`EVENTS` WHERE `EVENT_SCHEMA` = ?', [name]),
    ]);
    const blocking = [
      ...views.map((row) => `view ${row.name}`),
      ...routines.map((row) => row.name),
      ...triggers.map((row) => `trigger ${row.name}`),
      ...events.map((row) => `event ${row.name}`),
    ];
    if (blocking.length) {
      throw new Error(`MySQL cannot move views, routines, triggers and events to other database (${blocking.slice(0, 10).join(', ')}${blocking.length > 10 ? ', …' : ''}). `
        + 'Export the database and import it under the new name instead.');
    }
    const source = MysqlDatabaseOperations.database(name);
    const tables = await this.baseTables(name);
    const statements = [`CREATE DATABASE ${target} COLLATE ${MysqlDdlBuilder.word(schema.DEFAULT_COLLATION_NAME, 'Collation')}`];
    if (tables.length) {
      // one RENAME TABLE is atomic - all tables are moved or none
      statements.push(`RENAME TABLE\n  ${tables.map((table) => `${source}.${mysql.escapeId(table)} TO ${target}.${mysql.escapeId(table)}`).join(',\n  ')}`);
    }
    statements.push(`DROP DATABASE ${source}`);
    return statements;
  }

  static createTable(operation: Extract<DatabaseOperationType, {kind: 'createTable'}>): string {
    const table = MysqlDdlBuilder.tableName({databaseName: operation.database, name: operation.name});
    MysqlDatabaseOperations.checkColumns(operation);
    const lines = operation.columns.map((column) => MysqlDdlBuilder.columnDefinition(column));
    if (operation.primaryKey?.length) {
      lines.push(`PRIMARY KEY (${mysql.escapeId(operation.primaryKey)})`);
    }
    (operation.indexes || []).forEach((index) => {
      const kind = {INDEX: 'INDEX', UNIQUE: 'UNIQUE INDEX', FULLTEXT: 'FULLTEXT INDEX'}[index.kind];
      if (!kind) {
        throw new Error(`Unknown index kind ${index.kind}`);
      }
      const name = index.name?.trim() ? ` ${mysql.escapeId(index.name.trim())}` : '';
      lines.push(`${kind}${name} (${mysql.escapeId(index.columns)})`);
    });
    const options: string[] = [];
    if (operation.engine) options.push(`ENGINE = ${MysqlDdlBuilder.word(operation.engine, 'Engine')}`);
    if (operation.collation) options.push(`DEFAULT COLLATE = ${MysqlDdlBuilder.word(operation.collation, 'Collation')}`);
    if (operation.comment) options.push(`COMMENT = ${mysql.escape(operation.comment)}`);
    return `CREATE TABLE ${table} (\n  ${lines.join(',\n  ')}\n)${options.length ? `\n${options.join('\n')}` : ''}`;
  }

  /** names of columns are unique, keys use existing columns */
  static checkColumns(operation: Extract<DatabaseOperationType, {kind: 'createTable'}>): void {
    if (!operation.columns?.length) {
      throw new Error('Table needs at least one column');
    }
    const names = operation.columns.map((column) => MysqlDdlBuilder.requireName(column?.name, 'Column name'));
    const duplicate = names.find((name, index) => names.findIndex((other) => other.toLowerCase() === name.toLowerCase()) !== index);
    if (duplicate) {
      throw new Error(`Column ${duplicate} is defined more times`);
    }
    const known = (column: string) => names.includes(column);
    const missing = [...(operation.primaryKey || []), ...(operation.indexes || []).flatMap((index) => index.columns || [])].find((column) => !known(column));
    if (missing) {
      throw new Error(`Key uses unknown column ${missing}`);
    }
    (operation.indexes || []).forEach((index) => {
      if (!index.columns?.length) {
        throw new Error('Index needs at least one column');
      }
    });
  }

  private async tablesOperation(operation: Extract<DatabaseOperationType, {kind: 'tables'}>): Promise<string[]> {
    const tables = MysqlDatabaseOperations.uniqueTables(operation.tables);
    const rows = await this.queryRows(
      'SELECT `TABLE_NAME`, `TABLE_TYPE` FROM `information_schema`.`TABLES` WHERE `TABLE_SCHEMA` = ? AND `TABLE_NAME` IN (?)',
      [operation.database, tables],
    );
    const typeOf = new Map(rows.map((row) => [row.TABLE_NAME, row.TABLE_TYPE]));
    const missing = tables.find((table) => !typeOf.has(table));
    if (missing) {
      throw new Error(`Table ${operation.database}.${missing} does not exist`);
    }
    const views = tables.filter((table) => /VIEW/i.test(typeOf.get(table)));
    const baseTables = tables.filter((table) => !views.includes(table));
    const statements: string[] = [];

    if (operation.action === 'truncate') {
      if (views.length) {
        throw new Error(`Views cannot be truncated: ${views.join(', ')}`);
      }
      baseTables.forEach((table) => statements.push(`TRUNCATE TABLE ${MysqlDdlBuilder.tableName({databaseName: operation.database, name: table})}`));
    } else if (operation.action === 'drop') {
      if (views.length) statements.push(`DROP VIEW ${MysqlDatabaseOperations.tableList(operation.database, views)}`);
      if (baseTables.length) statements.push(`DROP TABLE ${MysqlDatabaseOperations.tableList(operation.database, baseTables)}`);
    } else {
      throw new Error(`Unknown action ${operation.action}`);
    }
    // statements run on one connection - setting is valid for them and it is reset with the connection
    return operation.ignoreForeignKeys
      ? ['SET FOREIGN_KEY_CHECKS = 0', ...statements, 'SET FOREIGN_KEY_CHECKS = 1']
      : statements;
  }

  private async baseTables(database: string): Promise<string[]> {
    const rows = await this.queryRows(
      "SELECT `TABLE_NAME` FROM `information_schema`.`TABLES` WHERE `TABLE_SCHEMA` = ? AND `TABLE_TYPE` = 'BASE TABLE' ORDER BY `TABLE_NAME`",
      [database],
    );
    return rows.map((row) => row.TABLE_NAME);
  }

  private static uniqueTables(tables: string[]): string[] {
    if (!Array.isArray(tables) || !tables.length) {
      throw new Error('No table selected');
    }
    return Array.from(new Set(tables.map((table) => MysqlDdlBuilder.requireName(table, 'Table name'))));
  }

  private static tableList(database: string, tables: string[]): string {
    return MysqlDatabaseOperations.uniqueTables(tables).map((table) => MysqlDdlBuilder.tableName({databaseName: database, name: table})).join(', ');
  }

  private static database(name: string): string {
    return mysql.escapeId(MysqlDdlBuilder.requireName(name, 'Database name'));
  }

  private static notSystem(name: string): void {
    if (SYSTEM_DATABASES.includes(String(name).trim().toLowerCase())) {
      throw new Error(`${name} is a system database`);
    }
  }

  private static objectType(object: ObjectRefInterface): string {
    const type = String(object?.type || '').toUpperCase();
    if (!OBJECT_TYPES.includes(type)) {
      throw new Error(`Unknown object type ${object?.type}`);
    }
    return type;
  }

  private static objectName(database: string, object: ObjectRefInterface): string {
    return MysqlDdlBuilder.tableName({databaseName: database, name: object.name});
  }
}

export default MysqlDatabaseOperations;
