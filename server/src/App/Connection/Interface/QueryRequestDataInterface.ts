import DatabaseInterface from '../../Driver/Interface/Data/DatabaseInterface';

interface QueryRequestDataInterface {
  query: string;
  database: DatabaseInterface;
  tabId?: string;
  /** long texts whole, not as preview (export of all rows) */
  fullValues?: boolean;
}

export default QueryRequestDataInterface;
