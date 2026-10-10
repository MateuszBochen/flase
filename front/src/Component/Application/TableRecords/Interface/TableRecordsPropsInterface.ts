import ConnectionDataInterface from '../../../../Library/Connection/Interface/ConnectionDataInterface';
import Database from '../../../../Library/Database/Interface/Database';
import TableInformationInterface from '../../../../Library/Table/Interface/TableInformationInterface';
import ApplicationInterface from '../../ApplicationInterface';

interface TableRecordsPropsInterface extends ApplicationInterface {
  connection: ConnectionDataInterface;
  database: Database;
  table: TableInformationInterface;
  /** query instead of default SELECT of table, e.g. row of foreign key */
  initialQuery?: string;
}

export default TableRecordsPropsInterface;
