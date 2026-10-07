import Database from '../../Database/Interface/Database';
import TableInterface from '../../Table/Interface/TableInterface';
import RowChangeInterface from './RowChangeInterface';

interface ApplyRowChangesRequestInterface {
  tabId?: string;
  database: Database;
  table: TableInterface;
  changes: RowChangeInterface[];
  /** only build sql for preview, do not execute */
  dryRun: boolean;
}

export default ApplyRowChangesRequestInterface;
