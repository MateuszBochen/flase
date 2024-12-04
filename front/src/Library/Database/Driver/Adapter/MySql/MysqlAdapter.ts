import DriverInterface from '../../DriverInterface';
import TableInformationInterface from '../../../../Table/Interface/TableInformationInterface';

class MysqlAdapter implements DriverInterface {

  getDefaultQuery(table: TableInformationInterface): string {
    return `SELECT * FROM \`${table.tableName}\` LIMIT 0, 100`;
  }

}
export default MysqlAdapter;
