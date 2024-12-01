import ConnectionRequestInterface from '../Connection/Interface/ConnectionRequestInterface';
import MysqlAdapter from './Drivers/Mysql/MysqlAdapter';
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
    console.log(parsedDsn);

    switch(parsedDsn.driver) {
      case 'mysql':
        return new MysqlAdapter(connectionData, parsedDsn);
      default:
        throw new Error(`Given ${parsedDsn.driver} is not supported yet`);
    }
  }
}

export default DriverFactory;
