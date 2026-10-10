import DatabaseInterface from './DatabaseInterface';
import TableInterface from './TableInterface';
import RowChangeInterface from './RowChangeInterface';

interface ApplyRowChangesRequestInterface {
  tabId?: string;
  database: DatabaseInterface;
  table: TableInterface;
  changes: RowChangeInterface[];
  /** only build sql for preview, do not execute */
  dryRun: boolean;
}

export default ApplyRowChangesRequestInterface;
