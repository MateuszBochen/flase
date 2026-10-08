import {Parser} from 'node-sql-parser';
import DriverInterface from '../../DriverInterface';
import TableInformationInterface from '../../../../Table/Interface/TableInformationInterface';
import QueryInterface from '../../../Interface/QueryInterface';
import QueryModel from '../MySql/QueryModel';
import TableInterface from '../../../../Table/Interface/TableInterface';
import {CellValueType} from '../../../../../Component/Table/Interface/RecordsViewPropsInterface';
import {SearchModeType} from '../../../Interface/DatabaseSearchInterface';
import SqlDialectType from '../../SqlDialectType';
import DriverFeaturesInterface from '../../DriverFeaturesInterface';
import PostgresSqlLiteral from './PostgresSqlLiteral';
import postgresKeywords from './PostgresKeywords';

/** PostgreSQL - "databases" of tree are schemas of connected database */
class PostgresAdapter implements DriverInterface {
  readonly dialect: SqlDialectType = 'postgresql';
  readonly sql = new PostgresSqlLiteral();
  readonly keywords = postgresKeywords;
  readonly features: DriverFeaturesInterface = {
    databaseLabel: 'Schema',
    columnTypes: [
      'integer', 'bigint', 'smallint', 'numeric(10,2)', 'real', 'double precision', 'boolean',
      'varchar(255)', 'char(36)', 'text', 'uuid', 'jsonb', 'json',
      'date', 'timestamp', 'timestamptz', 'time', 'interval', 'bytea', 'text[]', 'inet',
    ],
    columnPosition: false,
    onUpdateTimestamp: false,
    indexKinds: ['INDEX', 'UNIQUE', 'PRIMARY'],
    indexLength: false,
    dumpCreateDatabaseLabel: 'CREATE SCHEMA + search_path',
    dumpHint: 'Data are read in one transaction (consistent snapshot). Enum types, trigger functions and sequence values are included, foreign keys are added after data.',
  };
  private readonly parser = new Parser();
  private readonly options = {database: 'postgresql'};

  getDefaultQuery(table: TableInformationInterface): QueryInterface {
    return new QueryModel(`SELECT * FROM ${this.sql.identifier(table.tableName)} LIMIT 100 OFFSET 0`, this.parser, this.options);
  }

  getSelectStringFromQuery(query: QueryInterface): string {
    return '';
  }

  getRowsQuery(table: TableInterface, currentDatabase: string, conditions: {column: string, value: CellValueType}[]): string {
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
