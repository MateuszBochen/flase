import DatabaseInterface from '../../Driver/Interface/Data/DatabaseInterface';

interface QueryRequestDataInterface {
  query: string;
  database: DatabaseInterface;
  tabId?: string;
}

export default QueryRequestDataInterface;
