import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import Database from '../../../Library/Database/Interface/Database';
import TableInformationInterface from '../../../Library/Table/Interface/TableInformationInterface';

interface TableItemPropsInterface {
  connection: ConnectionDataInterface;
  database: Database;
  table: TableInformationInterface;
  key: string|number;
}
export default TableItemPropsInterface;
