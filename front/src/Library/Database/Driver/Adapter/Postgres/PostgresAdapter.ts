import {Parser} from 'node-sql-parser';
import {SqlValueType} from '../../SqlLiteralInterface';
import DriverInterface from '../../DriverInterface';
import TableInformationInterface from '../../../../Table/Interface/TableInformationInterface';
import QueryInterface from '../../../Interface/QueryInterface';
import QueryModel from '../MySql/QueryModel';
import TableInterface from '../../../../Table/Interface/TableInterface';
import {SearchModeType} from '../../../Interface/DatabaseSearchInterface';
import SqlDialectType from '../../SqlDialectType';
import DriverFeaturesInterface from '../../DriverFeaturesInterface';
import PostgresSqlLiteral from './PostgresSqlLiteral';
import postgresKeywords from './PostgresKeywords';
import {POSTGRES_SYNTAX} from '../../Syntax/SqlSyntax';
import {DatabaseRoutineInterface, ObjectRefInterface} from '../../../Interface/DatabaseObjectsInterface';
import {RoutineValueType} from '../../RoutineCallInterface';
import {POSTGRES_MAINTENANCE, postgresObjectTemplate, postgresPlanStatements, postgresRoutineStatements} from './PostgresStatements';

/** PostgreSQL - "databases" of tree are schemas of connected database */
class PostgresAdapter implements DriverInterface {
  readonly dialect: SqlDialectType = 'postgresql';
  readonly sql = new PostgresSqlLiteral();
  readonly keywords = postgresKeywords;
  readonly syntax = POSTGRES_SYNTAX;
  readonly features: DriverFeaturesInterface = {
    productName: 'PostgreSQL',
    databaseLabel: 'Schema',
    columnTypes: [
      'integer', 'bigint', 'smallint', 'numeric(10,2)', 'real', 'double precision', 'boolean',
      'varchar(255)', 'char(36)', 'text', 'uuid', 'jsonb', 'json',
      'date', 'timestamp', 'timestamptz', 'time', 'interval', 'bytea', 'text[]', 'inet',
    ],
    autoIncrementType: 'integer',
    columnPosition: false,
    onUpdateTimestamp: false,
    indexKinds: ['INDEX', 'UNIQUE', 'PRIMARY'],
    indexLength: false,
    foreignKeyActions: ['NO ACTION', 'RESTRICT', 'CASCADE', 'SET NULL', 'SET DEFAULT'],
    tableEngine: false,
    collations: false,
    transactionalDdl: true,
    binaryUuidText: false,
    maintenanceActions: POSTGRES_MAINTENANCE,
    dumpCreateDatabaseLabel: 'CREATE SCHEMA + search_path',
    dumpHint: 'Data are read in one transaction (consistent snapshot). Enum types, trigger functions and sequence values are included, foreign keys are added after data.',
    labels: {
      engine: 'Access method',
      engines: 'Access methods',
      engineSupport: 'Type',
      characterSet: 'Encoding',
      hitRatio: 'Cache hit ratio',
      rates: 'Rows per second',
    },
    hints: {
      regexReplace: 'regexp_replace with flag g - all matches; groups in replacement: \\1.',
      objectEditor: 'Write one CREATE statement, body of function in $$ … $$.',
      objectReplace: 'CREATE OR REPLACE keeps dependent objects; other statements drop the object first (in one transaction).',
      autoIncrement: 'Auto increment sets next value of identity / serial sequence of the table.',
      autoIncrementPlaceholder: 'next value of identity / serial',
      ignoreForeignKeys: (action, many) => `CASCADE - also ${action === 'drop'
        ? `objects depending on the ${many ? 'tables' : 'table'}`
        : `tables referencing ${many ? 'them' : 'it'}`}`,
      renameDatabase: null,
      renameDatabaseForm: null,
      dropDatabase: 'Everything in the schema is dropped (CASCADE).',
      objectRestore: null,
    },
  };
  private readonly parser = new Parser();
  private readonly options = {database: 'postgresql'};

  planStatements(query: string, analyze: boolean): string[] {
    return postgresPlanStatements(query, analyze);
  }

  routineStatements(database: string, routine: DatabaseRoutineInterface, values: RoutineValueType[]): string[] {
    return postgresRoutineStatements(this.sql, database, routine, values);
  }

  objectTemplate(type: ObjectRefInterface['type'], table: string): string {
    return postgresObjectTemplate(type, table);
  }

  getDefaultQuery(table: TableInformationInterface): QueryInterface {
    return new QueryModel(`SELECT * FROM ${this.sql.identifier(table.tableName)} LIMIT 100 OFFSET 0`, this.parser, this.options);
  }

  getSelectStringFromQuery(query: QueryInterface): string {
    return '';
  }

  getRowsQuery(table: TableInterface, currentDatabase: string, conditions: {column: string, value: SqlValueType}[]): string {
    const where = conditions.length
      ? ` WHERE ${conditions.map((condition) => this.sql.equals(condition.column, condition.value)).join(' AND ')}`
      : '';
    return `SELECT * FROM ${this.sql.table(table.databaseName, table.name, currentDatabase)}${where} LIMIT 100 OFFSET 0`;
  }

  /** the same comparison as database search - case insensitive, other types than text compared as text */
  getSearchQuery(table: TableInterface, currentDatabase: string, columns: {name: string, text: boolean}[], term: string, mode: SearchModeType): string {
    const pattern = mode === 'exact' ? term : `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const operator = mode === 'exact' ? '=' : 'ILIKE';
    const where = columns.map((column) => {
      const name = column.text ? this.sql.identifier(column.name) : `${this.sql.identifier(column.name)}::text`;
      return `${name} ${operator} ${this.sql.value(pattern)}`;
    }).join(' OR ');
    return `SELECT * FROM ${this.sql.table(table.databaseName, table.name, currentDatabase)} WHERE ${where} LIMIT 100 OFFSET 0`;
  }
}

export default PostgresAdapter;
