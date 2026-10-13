import React from 'react';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import Database from '../../../Library/Database/Interface/Database';
import TableInformationInterface from '../../../Library/Table/Interface/TableInformationInterface';

interface TableItemPropsInterface {
  connection: ConnectionDataInterface;
  database: Database;
  table: TableInformationInterface;
  key: string|number;
  /** chosen by arrows in filter - Enter opens it */
  highlighted?: boolean;
  /** table is open in some tab */
  openInTab?: boolean;
  /** table is open in the current tab */
  activeInTab?: boolean;
  onContextMenu?: (event: React.MouseEvent, table: TableInformationInterface) => void;
}
export default TableItemPropsInterface;
