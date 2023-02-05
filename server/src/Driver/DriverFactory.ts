import MysqlAdapter from './Drivers/Mysql/MysqlAdapter';
import DriverInterface from './DriverInterface';
import ConnectionDataType from './Type/ConnectionDataType';

/**
 * Driver class factory.
 */
class DriverFactory {

  /**
   * Metod taking name and connection data to create new data driver.
   */
  getDriver(driverName: string, connectionData: ConnectionDataType): DriverInterface
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
