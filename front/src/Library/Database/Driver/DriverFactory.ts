import ConnectionDataInterface from '../../Connection/Interface/ConnectionDataInterface';
import DriverInterface from './DriverInterface';
import {parseDsnOrThrow} from '@soluble/dsn-parser';
import MysqlAdapter from './Adapter/MySql/MysqlAdapter';


class DriverFactory {

  private static drivers: {[key: string]: DriverInterface} = {}

  public static getDriver(connection: ConnectionDataInterface): DriverInterface {

    if (connection.id in DriverFactory.drivers) {
      return DriverFactory.drivers[connection.id];
    }


    const parsedDsn = parseDsnOrThrow(connection.dsn);
    switch (parsedDsn.driver) {
      case 'mysql':
        DriverFactory.drivers[connection.id] = new MysqlAdapter();
        return DriverFactory.drivers[connection.id];
      default:
        throw new Error(`Driver ${parsedDsn.driver} is not supported`);
    }
  }
}

export default DriverFactory;
