import Database from '../../Database/Interface/Database';


interface QueryRequestDataInterface {
  query: string;
  database: Database;
  tabId?: string;
}

export default QueryRequestDataInterface;
