import DriverInterface from '../../DriverInterface';
import TableInformationInterface from '../../../../Table/Interface/TableInformationInterface';
import {Parser} from 'node-sql-parser';
import QueryInterface from '../../../Interface/QueryInterface';
import QueryModel from './QueryModel';
import TableInterface from '../../../../Table/Interface/TableInterface';
import {CellValueType} from '../../../../../Component/Table/Interface/RecordsViewPropsInterface';
import SqlLiteral from './SqlLiteral';
import SqlDialectType from '../../SqlDialectType';
import DriverFeaturesInterface from '../../DriverFeaturesInterface';
import defaultMysqlKeyWords from './DefaultAutocompleteKeywords';
import {SearchModeType} from '../../../Interface/DatabaseSearchInterface';

class MysqlAdapter implements DriverInterface {
  readonly dialect: SqlDialectType = 'mysql';
  readonly sql = new SqlLiteral();
  readonly keywords = defaultMysqlKeyWords;
  readonly features: DriverFeaturesInterface = {
    databaseLabel: 'Database',
    columnTypes: [
      'int', 'int unsigned', 'bigint', 'bigint unsigned', 'tinyint(1)', 'smallint', 'decimal(10,2)', 'float', 'double',
      'varchar(255)', 'char(36)', 'text', 'mediumtext', 'longtext', 'json',
      'date', 'datetime', 'timestamp', 'time', 'year', "enum('a','b')", 'blob',
    ],
    columnPosition: true,
    onUpdateTimestamp: true,
    indexKinds: ['INDEX', 'UNIQUE', 'FULLTEXT', 'PRIMARY'],
    indexLength: true,
    dumpCreateDatabaseLabel: 'CREATE DATABASE + USE',
    dumpHint: 'Data are read in one transaction (consistent snapshot of InnoDB tables). DEFINER of views and triggers is left out.',
  };
  private readonly parser;

  constructor() {
    this.parser = new Parser();
  }

  getDefaultQuery(table: TableInformationInterface): QueryInterface {
    const stringQuery =  `SELECT * FROM \`${table.tableName}\` WHERE 1 LIMIT 0, 100`;
    return new QueryModel(stringQuery, this.parser);
  }

  getSelectStringFromQuery(query: QueryInterface): string {

    return '';
  }

  getRowsQuery(table: TableInterface, currentDatabase: string, conditions: {column: string, value: CellValueType}[]): string {
    const where = conditions.length
      ? conditions.map((condition) => this.sql.equals(condition.column, condition.value)).join(' AND ')
      : '1';
    return `SELECT * FROM ${this.sql.table(table.databaseName, table.name, currentDatabase)} WHERE ${where} LIMIT 0, 100`;
  }

  getSearchQuery(table: TableInterface, currentDatabase: string, columns: {name: string, text: boolean}[], term: string, mode: SearchModeType): string {
    const pattern = mode === 'exact' ? term : `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const operator = mode === 'exact' ? '=' : 'LIKE';
    const where = columns.map((column) => {
      const name = column.text ? this.sql.identifier(column.name) : `CAST(${this.sql.identifier(column.name)} AS CHAR)`;
      return `${name} ${operator} ${this.sql.value(pattern)}`;
    }).join(' OR ');
    return `SELECT * FROM ${this.sql.table(table.databaseName, table.name, currentDatabase)} WHERE ${where} LIMIT 0, 100`;
  }

}
export default MysqlAdapter;
