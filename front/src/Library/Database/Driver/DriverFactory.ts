import ConnectionDataInterface from '../../Connection/Interface/ConnectionDataInterface';
import DriverInterface from './DriverInterface';
import {parseConnectionDsnOrThrow} from '../../Connection/Dsn';
import MysqlAdapter from './Adapter/MySql/MysqlAdapter';
import PostgresAdapter from './Adapter/Postgres/PostgresAdapter';
import {engineOfScheme} from '../../Connection/Engines';


class DriverFactory {

  private static drivers: {[key: string]: DriverInterface} = {}

  public static getDriver(connection: ConnectionDataInterface): DriverInterface {

    if (connection.id in DriverFactory.drivers) {
      return DriverFactory.drivers[connection.id];
    }


    const parsedDsn = parseConnectionDsnOrThrow(connection.dsn);
    const engine = engineOfScheme(parsedDsn.driver);
    if (!engine) {
      throw new Error(`Driver ${parsedDsn.driver} is not supported`);
    }
    // compatible engines (MariaDB, TiDB / CockroachDB, YugabyteDB) use driver of their family
    DriverFactory.drivers[connection.id] = engine.dialect === 'mysql' ? new MysqlAdapter() : new PostgresAdapter();
    return DriverFactory.drivers[connection.id];
  }
}

export default DriverFactory;
