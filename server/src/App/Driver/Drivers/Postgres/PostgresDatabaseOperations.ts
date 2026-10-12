import {
  DatabaseObjectsInterface,
  DatabaseRoutineInterface,
  ObjectRefInterface,
  RoutineParameterInterface,
  ServerOptionsInterface,
} from '../../Interface/Data/DatabaseObjectsInterface';
import {DatabaseOperationType, MaintenanceActionType} from '../../Interface/Data/DatabaseOperationInterface';
import PostgresCatalog, {RELATION_KINDS} from './PostgresCatalog';
import PostgresSql from './PostgresSql';
import PostgresDdlBuilder from './PostgresDdlBuilder';
import SqlText from '../../Query/SqlText';

type QueryRowsType = (sql: string, params?: any[]) => Promise<any[]>;

const MAINTENANCE: {[action in MaintenanceActionType]?: string} = {
  vacuum: 'VACUUM',
  vacuumFull: 'VACUUM FULL',
  vacuumAnalyze: 'VACUUM (ANALYZE)',
  analyze: 'ANALYZE',
  reindex: 'REINDEX TABLE',
};

const PARAMETER_MODES: {[mode: string]: string} = {i: 'IN', o: 'OUT', b: 'INOUT', v: 'VARIADIC'};

/** json of query result - parsed by driver, text when parser of type was changed */
const json = (value: any): any => typeof value === 'string' ? JSON.parse(value) : value;

/**
 * Objects of schema and operations on schemas, more tables, views, functions, procedures and triggers (PostgreSQL).
 * "database" of application is schema here.
 * @author Mateusz Bochen
 */
class PostgresDatabaseOperations {
  constructor(private readonly catalog: PostgresCatalog, private readonly queryRows: QueryRowsType) {
  }

  async getDatabaseObjects(schema: string): Promise<DatabaseObjectsInterface> {
    const warnings: string[] = [];
    const load = <T>(part: string, loader: Promise<T>, fallback: T): Promise<T> => loader.catch((e) => {
      warnings.push(`${part}: ${e?.message || e}`);
      return fallback;
    });

    const [current] = await this.queryRows('SELECT current_database() AS name, EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS found', [schema]);
    if (!current?.found) {
      throw new Error(`Schema ${schema} does not exist`);
    }

    const types: {[kind: string]: string} = {r: 'BASE TABLE', p: 'PARTITIONED TABLE', v: 'VIEW', m: 'MATERIALIZED VIEW', f: 'FOREIGN TABLE'};
    const [tables, routines, triggers] = await Promise.all([
      load('Tables', this.queryRows(
        `SELECT c.relname AS name, c.relkind AS kind, c.reltuples, obj_description(c.oid, 'pg_class') AS comment, am.amname AS access_method,
                CASE WHEN c.relkind IN ('r', 'p', 'm') THEN pg_table_size(c.oid) END AS data_length,
                CASE WHEN c.relkind IN ('r', 'p', 'm') THEN pg_indexes_size(c.oid) END AS index_length
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_am am ON am.oid = c.relam
         WHERE n.nspname = $1 AND c.relkind = ANY($2) AND NOT c.relispartition
         ORDER BY c.relname`,
        [schema, RELATION_KINDS],
      ), []),
      load('Routines', this.queryRows(
        `SELECT p.proname AS name, p.prokind AS kind, pg_get_function_identity_arguments(p.oid) AS signature,
                CASE WHEN p.prokind = 'f' THEN pg_get_function_result(p.oid) END AS returns, l.lanname AS language,
                obj_description(p.oid, 'pg_proc') AS comment,
                to_json(p.proargnames) AS arg_names, to_json(p.proargmodes::text[]) AS arg_modes,
                to_json(ARRAY(SELECT format_type(t.type, NULL)
                              FROM unnest(COALESCE(p.proallargtypes, p.proargtypes::oid[])) WITH ORDINALITY AS t(type, position)
                              ORDER BY t.position)) AS arg_types
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
         JOIN pg_language l ON l.oid = p.prolang
         WHERE n.nspname = $1 AND p.prokind IN ('f', 'p')
           -- functions of extensions are not own code of database
           AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
         ORDER BY p.prokind DESC, p.proname, 3`,
        [schema],
      ), []),
      load('Triggers', this.catalog.triggers(schema, null), []),
    ]);

    return {
      database: schema,
      catalog: current.name,
      collation: null,
      tables: tables.map((row) => {
        const isView = row.kind === 'v' || row.kind === 'm';
        return {
          name: row.name,
          type: types[row.kind] || row.kind,
          isView,
          engine: row.access_method,
          collation: null,
          // -1 - table was never analysed
          rows: row.reltuples !== null && Number(row.reltuples) >= 0 && row.kind !== 'v' ? Math.round(Number(row.reltuples)) : null,
          dataLength: row.data_length === null ? null : Number(row.data_length),
          indexLength: row.index_length === null ? null : Number(row.index_length),
          comment: row.comment || '',
        };
      }),
      routines: routines.map((row): DatabaseRoutineInterface => ({
        kind: row.kind === 'p' ? 'PROCEDURE' : 'FUNCTION',
        name: row.name,
        signature: row.signature || '',
        parameters: PostgresDatabaseOperations.parameters(json(row.arg_names), json(row.arg_modes), json(row.arg_types)),
        returns: row.returns || null,
        language: row.language,
        comment: row.comment || '',
      })),
      triggers: triggers.map((trigger) => ({name: trigger.name, table: trigger.table, timing: trigger.timing, event: trigger.event})),
      events: null,
      eventScheduler: null,
      warnings,
    };
  }

  /** arguments of pg_proc - columns of RETURNS TABLE (mode t) are not parameters */
  private static parameters(names: string[] | null, modes: string[] | null, types: string[] | null): RoutineParameterInterface[] {
    return (types || [])
      .map((type, index) => ({mode: modes?.[index] || 'i', name: names?.[index] || '', type}))
      .filter((parameter) => parameter.mode !== 't')
      .map((parameter) => ({...parameter, mode: PARAMETER_MODES[parameter.mode] || parameter.mode}));
  }

  getServerOptions(): Promise<ServerOptionsInterface> {
    // schema and table have no collation or engine
    return Promise.resolve({collations: [], engines: [], defaultCollation: null});
  }

  async getObjectDdl(schema: string, object: ObjectRefInterface): Promise<string> {
    switch (object?.type) {
      case 'FUNCTION':
      case 'PROCEDURE': {
        const [row] = await this.queryRows(
          `SELECT pg_get_functiondef(p.oid) AS ddl FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = $1 AND p.proname = $2 AND pg_get_function_identity_arguments(p.oid) = $3`,
          [schema, object.name, object.signature || ''],
        );
        if (!row) {
          throw new Error(`${object.type === 'FUNCTION' ? 'Function' : 'Procedure'} ${schema}.${object.name}(${object.signature || ''}) does not exist`);
        }
        return String(row.ddl).trim();
      }
      case 'TRIGGER': {
        const trigger = (await this.catalog.triggers(schema, object.table || null)).find((item) => item.name === object.name);
        if (!trigger) {
          throw new Error(`Trigger ${object.name} does not exist`);
        }
        return trigger.definition;
      }
      case 'VIEW': {
        const relation = (await this.catalog.relations(schema)).find((item) => item.name === object.name);
        if (!relation || (relation.kind !== 'v' && relation.kind !== 'm')) {
          throw new Error(`View ${schema}.${object.name} does not exist`);
        }
        return this.catalog.createView(schema, object.name, relation.kind);
      }
      case 'EVENT':
        throw new Error('PostgreSQL has no events - use pg_cron or scheduler of operating system');
      default:
        throw new Error(`Unknown object type ${object?.type}`);
    }
  }

  async build(operation: DatabaseOperationType): Promise<string[]> {
    switch (operation.kind) {
      case 'createDatabase':
        return [`CREATE SCHEMA ${PostgresSql.identifier(PostgresDatabaseOperations.requireName(operation.name, 'Schema name'))}`];
      case 'alterDatabase':
        throw new Error('Schema of PostgreSQL has no collation - it is set for database when it is created, or for columns');
      case 'renameDatabase': {
        PostgresDatabaseOperations.notSystem(operation.name);
        const newName = PostgresDatabaseOperations.requireName(operation.newName, 'New schema name');
        if (newName === operation.name) {
          throw new Error('New name is the same');
        }
        return [`ALTER SCHEMA ${PostgresSql.identifier(operation.name)} RENAME TO ${PostgresSql.identifier(newName)}`];
      }
      case 'dropDatabase':
        PostgresDatabaseOperations.notSystem(operation.name);
        // schema is dropped with everything in it - as DROP DATABASE of MySQL
        return [`DROP SCHEMA ${PostgresSql.identifier(PostgresDatabaseOperations.requireName(operation.name, 'Schema name'))} CASCADE`];
      case 'createTable':
        return PostgresDatabaseOperations.createTable(operation);
      case 'tables':
        return this.tablesOperation(operation);
      case 'maintenance': {
        const command = MAINTENANCE[operation.action];
        if (!command) {
          throw new Error(`${operation.action} is not available in PostgreSQL - use VACUUM, ANALYZE or REINDEX`);
        }
        // one statement for each table - result of every table is reported
        return PostgresDatabaseOperations.uniqueTables(operation.tables).map((table) => `${command} ${PostgresSql.table(operation.database, table)}`);
      }
      case 'createView': {
        const select = SqlText.singleStatement(operation.select, 'postgresql', 'SELECT of view');
        const view = PostgresSql.table(operation.database, PostgresDatabaseOperations.requireName(operation.name, 'View name'));
        return [`CREATE ${operation.replace ? 'OR REPLACE ' : ''}VIEW ${view} AS\n${select}`];
      }
      case 'objectDdl': {
        const sql = SqlText.createStatement(operation.sql, 'postgresql');
        if (!operation.replace) {
          return [sql];
        }
        // CREATE OR REPLACE keeps triggers, views and grants depending on function / view
        if (['FUNCTION', 'PROCEDURE', 'VIEW'].includes(operation.replace.type) && /^CREATE\s+OR\s+REPLACE\b/i.test(sql)) {
          return [sql];
        }
        return [...(await this.dropStatement(operation.database, operation.replace, true)), sql];
      }
      case 'dropObject':
        return this.dropStatement(operation.database, operation.object, false);
      default:
        throw new Error(`Unknown operation ${(operation as DatabaseOperationType).kind}`);
    }
  }

  static createTable(operation: Extract<DatabaseOperationType, {kind: 'createTable'}>): string[] {
    const table = PostgresSql.table(
      PostgresDatabaseOperations.requireName(operation.database, 'Schema'),
      PostgresDatabaseOperations.requireName(operation.name, 'Table name'),
    );
    if (!operation.columns?.length) {
      throw new Error('Table needs at least one column');
    }
    const names = operation.columns.map((column) => PostgresDatabaseOperations.requireName(column?.name, 'Column name'));
    const duplicate = names.find((name, index) => names.indexOf(name) !== index);
    if (duplicate) {
      throw new Error(`Column ${duplicate} is defined more times`);
    }
    const missing = [...(operation.primaryKey || []), ...(operation.indexes || []).flatMap((index) => index.columns || [])].find((column) => !names.includes(column));
    if (missing) {
      throw new Error(`Key uses unknown column ${missing}`);
    }

    const lines = operation.columns.map((column) => PostgresDdlBuilder.columnDefinition(column));
    const after: string[] = [];
    if (operation.primaryKey?.length) {
      lines.push(`PRIMARY KEY (${PostgresSql.identifiers(operation.primaryKey)})`);
    }
    (operation.indexes || []).forEach((index) => {
      if (!index.columns?.length) {
        throw new Error('Index needs at least one column');
      }
      const name = index.name?.trim() ? PostgresSql.identifier(index.name.trim()) : '';
      const columns = PostgresSql.identifiers(index.columns);
      if (index.kind === 'UNIQUE') {
        lines.push(`${name ? `CONSTRAINT ${name} ` : ''}UNIQUE (${columns})`);
      } else if (index.kind === 'INDEX') {
        after.push(`CREATE INDEX${name ? ` ${name}` : ''} ON ${table} (${columns})`);
      } else {
        throw new Error('FULLTEXT index is not supported in PostgreSQL - use GIN index on to_tsvector() in SQL console');
      }
    });
    if (operation.comment) {
      after.push(`COMMENT ON TABLE ${table} IS ${PostgresSql.literal(operation.comment)}`);
    }
    operation.columns.filter((column) => column.comment).forEach((column) => {
      after.push(`COMMENT ON COLUMN ${table}.${PostgresSql.identifier(column.name.trim())} IS ${PostgresSql.literal(column.comment)}`);
    });
    return [`CREATE TABLE ${table} (\n  ${lines.join(',\n  ')}\n)`, ...after];
  }

  private async tablesOperation(operation: Extract<DatabaseOperationType, {kind: 'tables'}>): Promise<string[]> {
    const tables = PostgresDatabaseOperations.uniqueTables(operation.tables);
    const relations = await this.catalog.relations(operation.database);
    const kindOf = new Map(relations.map((relation) => [relation.name, relation.kind]));
    const missing = tables.find((table) => !kindOf.has(table));
    if (missing) {
      throw new Error(`Table ${operation.database}.${missing} does not exist`);
    }
    const list = (names: string[]) => names.map((name) => PostgresSql.table(operation.database, name)).join(', ');
    const cascade = operation.ignoreForeignKeys ? ' CASCADE' : '';
    const ofKinds = (kinds: string[]) => tables.filter((table) => kinds.includes(kindOf.get(table)!));

    if (operation.action === 'truncate') {
      const notTables = ofKinds(['v', 'm', 'f']);
      if (notTables.length) {
        throw new Error(`Only tables can be truncated: ${notTables.join(', ')}`);
      }
      // the same as MySQL - auto increment starts again
      return [`TRUNCATE TABLE ${list(tables)} RESTART IDENTITY${cascade}`];
    }
    if (operation.action !== 'drop') {
      throw new Error(`Unknown action ${operation.action}`);
    }
    const statements: string[] = [];
    const groups: [string, string[]][] = [['VIEW', ['v']], ['MATERIALIZED VIEW', ['m']], ['TABLE', ['r', 'p']], ['FOREIGN TABLE', ['f']]];
    groups.forEach(([object, kinds]) => {
      const names = ofKinds(kinds);
      if (names.length) statements.push(`DROP ${object} ${list(names)}${cascade}`);
    });
    return statements;
  }

  /** DROP of routine is written with its argument types (functions can be overloaded) */
  private async dropStatement(schema: string, object: ObjectRefInterface, ifExists: boolean): Promise<string[]> {
    const name = PostgresDatabaseOperations.requireName(object?.name, 'Name');
    switch (object.type) {
      case 'FUNCTION':
      case 'PROCEDURE': {
        const [row] = await this.queryRows(
          `SELECT format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)) AS ref
           FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = $1 AND p.proname = $2 AND pg_get_function_identity_arguments(p.oid) = $3`,
          [schema, name, object.signature || ''],
        );
        if (!row) {
          if (ifExists) return [];
          throw new Error(`${object.type === 'FUNCTION' ? 'Function' : 'Procedure'} ${schema}.${name}(${object.signature || ''}) does not exist`);
        }
        return [`DROP ${object.type} ${row.ref}`];
      }
      case 'TRIGGER': {
        const trigger = (await this.catalog.triggers(schema, object.table || null)).find((item) => item.name === name);
        if (!trigger) {
          if (ifExists) return [];
          throw new Error(`Trigger ${name} does not exist`);
        }
        return [`DROP TRIGGER ${PostgresSql.identifier(name)} ON ${PostgresSql.table(schema, trigger.table)}`];
      }
      case 'VIEW': {
        const relation = (await this.catalog.relations(schema)).find((item) => item.name === name);
        if (!relation || (relation.kind !== 'v' && relation.kind !== 'm')) {
          if (ifExists) return [];
          throw new Error(`View ${schema}.${name} does not exist`);
        }
        return [`DROP ${relation.kind === 'm' ? 'MATERIALIZED VIEW' : 'VIEW'} ${PostgresSql.table(schema, name)}`];
      }
      case 'EVENT':
        throw new Error('PostgreSQL has no events');
      default:
        throw new Error(`Unknown object type ${object?.type}`);
    }
  }

  private static uniqueTables(tables: string[]): string[] {
    if (!Array.isArray(tables) || !tables.length) {
      throw new Error('No table selected');
    }
    return Array.from(new Set(tables.map((table) => PostgresDatabaseOperations.requireName(table, 'Table name'))));
  }

  private static notSystem(name: string): void {
    const schema = String(name || '').trim();
    if (schema === 'information_schema' || schema.startsWith('pg_')) {
      throw new Error(`${name} is a system schema`);
    }
  }

  private static requireName(name: string | undefined, label: string): string {
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error(`${label} is required`);
    }
    return name.trim();
  }
}

export default PostgresDatabaseOperations;
