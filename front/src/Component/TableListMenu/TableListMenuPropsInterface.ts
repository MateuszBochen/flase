import ConnectionDataInterface from '../../Library/Connection/Interface/ConnectionDataInterface';
import Database from '../../Library/Database/Interface/Database';

interface TableListMenuPropsInterface {
  connection: ConnectionDataInterface;
  database: Database;
  key: string|number;
}

export default TableListMenuPropsInterface;
