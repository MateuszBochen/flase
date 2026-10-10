import Database from '../../Database/Interface/Database';
import QueryInterface from '../../Database/Interface/QueryInterface';


interface WebSocketQueryRequestDataInterface {
  query: string;
  database: Database;
  tabId?: string;
}

export default WebSocketQueryRequestDataInterface;
