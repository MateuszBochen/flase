import Database from '../../Database/Interface/Database';
import QueryInterface from '../../Database/Interface/QueryInterface';


interface QueryRequestDataInterface {
  query: QueryInterface;
  database: Database;
  tabId?: string;
  /** long texts whole, not as preview (export of all rows) */
  fullValues?: boolean;
  /** false - rows are not counted (export of all rows) */
  count?: boolean;
  /** count again, not the count remembered by server (Refresh, query run again) */
  recount?: boolean;
}

export default QueryRequestDataInterface;
