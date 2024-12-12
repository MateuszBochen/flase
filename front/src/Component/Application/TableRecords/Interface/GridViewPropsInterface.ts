import ConnectionDataInterface from '../../../../Library/Connection/Interface/ConnectionDataInterface';
import Database from '../../../../Library/Database/Interface/Database';
import TableInformationInterface from '../../../../Library/Table/Interface/TableInformationInterface';

interface GridViewPropsInterface {
  connection: ConnectionDataInterface;
  database: Database;
  table: TableInformationInterface;
  tabId: string;
}

export default GridViewPropsInterface;
