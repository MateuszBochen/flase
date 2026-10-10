import Database from '../../Database/Interface/Database';
import QueryInterface from '../../Database/Interface/QueryInterface';


interface QueryRequestDataInterface {
  query: QueryInterface;
  database: Database;
  tabId?: string;
}

export default QueryRequestDataInterface;
