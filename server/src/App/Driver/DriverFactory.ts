import ConnectionRequestInterface from '../Connection/Interface/ConnectionRequestInterface';
import MysqlAdapter from './Drivers/Mysql/MysqlAdapter';
import PostgresAdapter from './Drivers/Postgres/PostgresAdapter';
import DriverInterface from './DriverInterface';
import {parseDsnOrThrow} from '@soluble/dsn-parser';

/**
 * Driver class factory.
 */
class DriverFactory {

  /**
   * Metod taking name and connection data to create new data driver.
   */
  getDriver(connectionData: ConnectionRequestInterface): DriverInterface
  {
    const parsedDsn = parseDsnOrThrow(connectionData.connectionData.dsn);

    switch(parsedDsn.driver) {
      // MariaDB speaks MySQL protocol, differences are detected by server version
      case 'mysql':
      case 'mariadb':
        return new MysqlAdapter(connectionData, parsedDsn);
      case 'postgresql':
      case 'postgres':
      case 'pgsql':
        return new PostgresAdapter(connectionData, parsedDsn);
      default:
        throw new Error(`Given ${parsedDsn.driver} is not supported yet`);
    }
  }
}

export default DriverFactory;
