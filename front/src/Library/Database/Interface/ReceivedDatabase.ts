import Database from './Database';
import ConnectionDataInterface from '../../Connection/Interface/ConnectionDataInterface';

interface ReceivedDatabase {
  database: Database;
  connection: ConnectionDataInterface;
}

export default ReceivedDatabase;
