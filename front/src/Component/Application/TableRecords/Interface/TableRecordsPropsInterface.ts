import ConnectionDataInterface from '../../../../Library/Connection/Interface/ConnectionDataInterface';
import Database from '../../../../Library/Database/Interface/Database';
import TableInformationInterface from '../../../../Library/Table/Interface/TableInformationInterface';
import ApplicationInterface from '../../ApplicationInterface';
import {TableViewType} from './QueryPlacePropsInterface';

interface TableRecordsPropsInterface extends ApplicationInterface {
  connection: ConnectionDataInterface;
  database: Database;
  table: TableInformationInterface;
  /** query instead of default SELECT of table, e.g. row of foreign key */
  initialQuery?: string;
  /** view shown when tab is opened */
  initialView?: TableViewType;
}

export default TableRecordsPropsInterface;
