import Database from '../../Database/Interface/Database';
import QueryInterface from '../../Database/Interface/QueryInterface';


interface WebSocketQueryRequestDataInterface {
  query: string;
  database: Database;
  tabId?: string;
  /** long texts whole, not as preview (export of all rows) */
  fullValues?: boolean;
}

export default WebSocketQueryRequestDataInterface;
