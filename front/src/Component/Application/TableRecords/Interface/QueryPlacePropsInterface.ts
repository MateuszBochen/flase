import ConnectionDataInterface from '../../../../Library/Connection/Interface/ConnectionDataInterface';
import Database from '../../../../Library/Database/Interface/Database';
import TableInformationInterface from '../../../../Library/Table/Interface/TableInformationInterface';
import {TableOperationType} from '../Structure/TableOperations';
import {MutableRefObject} from 'react';
import QueryInterface from '../../../../Library/Database/Interface/QueryInterface';

export type TableViewType = 'data' | 'structure';

interface QueryPlacePropsInterface {
  connection: ConnectionDataInterface;
  database: Database;
  table: TableInformationInterface;
  tabId: string;
  initialQuery?: string;
  /** current query of the tab, shared with grid (export of all rows) */
  queryRef?: MutableRefObject<QueryInterface | null>;
  view: TableViewType;
  onViewChange: (view: TableViewType) => void;
  /** data view - run query again, structure view - load structure again */
  onReload: () => void;
  onTableOperation: (operation: TableOperationType) => void;
  /** EXPLAIN of current query */
  onExplain: () => void;
  /** dump / CSV import of the table */
  onTransfer: () => void;
  /** table was renamed / dropped */
  tableOperationsDisabled: boolean;
}

export default QueryPlacePropsInterface;
