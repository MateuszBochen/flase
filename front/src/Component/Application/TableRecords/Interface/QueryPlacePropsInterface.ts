import ConnectionDataInterface from '../../../../Library/Connection/Interface/ConnectionDataInterface';
import Database from '../../../../Library/Database/Interface/Database';
import TableInformationInterface from '../../../../Library/Table/Interface/TableInformationInterface';
import {TableOperationType} from '../Structure/TableOperations';

export type TableViewType = 'data' | 'structure';

interface QueryPlacePropsInterface {
  connection: ConnectionDataInterface;
  database: Database;
  table: TableInformationInterface;
  tabId: string;
  view: TableViewType;
  onViewChange: (view: TableViewType) => void;
  /** data view - run query again, structure view - load structure again */
  onReload: () => void;
  onTableOperation: (operation: TableOperationType) => void;
  /** table was renamed / dropped */
  tableOperationsDisabled: boolean;
}

export default QueryPlacePropsInterface;
