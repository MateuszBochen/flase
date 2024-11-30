import ConnectionRequestInterface from '../Connection/Interface/ConnectionRequestInterface';
import MysqlAdapter from './Drivers/Mysql/MysqlAdapter';
import DriverInterface from './DriverInterface';

/**
 * Driver class factory.
 */
class DriverFactory {

  /**
   * Metod taking name and connection data to create new data driver.
   */
  getDriver(driverName: string, connectionData: ConnectionRequestInterface): DriverInterface
  {
    switch(driverName) {
      case 'mysql':
        return new MysqlAdapter(connectionData);
      default:
        throw new Error(`Given ${driverName} is not supported yet`);
    }
  }
}

export default DriverFactory;
