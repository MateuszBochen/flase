import DriverInterface from '../../DriverInterface';
import TableInformationInterface from '../../../../Table/Interface/TableInformationInterface';
import {Parser} from 'node-sql-parser';
import QueryInterface from '../../../Interface/QueryInterface';
import QueryModel from './QueryModel';
import TableInterface from '../../../../Table/Interface/TableInterface';
import {CellValueType} from '../../../../../Component/Table/Interface/RecordsViewPropsInterface';
import SqlLiteral from './SqlLiteral';
import {SearchModeType} from '../../../Interface/DatabaseSearchInterface';

class MysqlAdapter implements DriverInterface {
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
      ? conditions.map((condition) => SqlLiteral.equals(condition.column, condition.value)).join(' AND ')
      : '1';
    return `SELECT * FROM ${SqlLiteral.table(table.databaseName, table.name, currentDatabase)} WHERE ${where} LIMIT 0, 100`;
  }

  getSearchQuery(table: TableInterface, currentDatabase: string, columns: {name: string, text: boolean}[], term: string, mode: SearchModeType): string {
    const pattern = mode === 'exact' ? term : `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
    const operator = mode === 'exact' ? '=' : 'LIKE';
    const where = columns.map((column) => {
      const name = column.text ? SqlLiteral.identifier(column.name) : `CAST(${SqlLiteral.identifier(column.name)} AS CHAR)`;
      return `${name} ${operator} ${SqlLiteral.value(pattern)}`;
    }).join(' OR ');
    return `SELECT * FROM ${SqlLiteral.table(table.databaseName, table.name, currentDatabase)} WHERE ${where} LIMIT 0, 100`;
  }

}
export default MysqlAdapter;
