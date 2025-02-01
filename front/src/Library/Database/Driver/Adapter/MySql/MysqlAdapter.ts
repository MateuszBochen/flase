import DriverInterface from '../../DriverInterface';
import TableInformationInterface from '../../../../Table/Interface/TableInformationInterface';
import {Parser} from 'node-sql-parser';
import QueryInterface from '../../../Interface/QueryInterface';
import QueryModel from './QueryModel';

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

}
export default MysqlAdapter;
