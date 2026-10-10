import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import Database from '../../../Library/Database/Interface/Database';
import TableInformationInterface from '../../../Library/Table/Interface/TableInformationInterface';

interface TableListPropsInterface {
  connection: ConnectionDataInterface;
  database: Database;
  tables: TableInformationInterface[];
}

export default TableListPropsInterface;
