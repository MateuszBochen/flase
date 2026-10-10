import ConnectionDataInterface from '../../../../Library/Connection/Interface/ConnectionDataInterface';
import Database from '../../../../Library/Database/Interface/Database';
import TableInformationInterface from '../../../../Library/Table/Interface/TableInformationInterface';
import {MutableRefObject} from 'react';
import QueryInterface from '../../../../Library/Database/Interface/QueryInterface';

interface GridViewPropsInterface {
  connection: ConnectionDataInterface;
  database: Database;
  table: TableInformationInterface;
  tabId: string;
  /** current query of the tab, set by query place */
  queryRef?: MutableRefObject<QueryInterface | null>;
}

export default GridViewPropsInterface;
