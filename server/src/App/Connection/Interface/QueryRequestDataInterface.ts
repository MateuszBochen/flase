import DatabaseInterface from '../../Driver/Interface/Data/DatabaseInterface';

interface QueryRequestDataInterface {
  query: string;
  database: DatabaseInterface;
  tabId?: string;
  /** long texts whole, not as preview (export of all rows) */
  fullValues?: boolean;
  /** false - rows are not counted (export of all rows) */
  count?: boolean;
  /** count again, not the remembered count (Refresh, query run again) */
  recount?: boolean;
}

export default QueryRequestDataInterface;
