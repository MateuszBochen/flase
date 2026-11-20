import ConnectionDataInterface from '../../Connection/Interface/ConnectionDataInterface';
import DriverInterface from './DriverInterface';
import {parseConnectionDsnOrThrow} from '../../Connection/Dsn';
import MysqlAdapter from './Adapter/MySql/MysqlAdapter';
import PostgresAdapter from './Adapter/Postgres/PostgresAdapter';
import {engineOfScheme} from '../../Connection/Engines';
import SqlDialectType from './SqlDialectType';

/** driver of each family - the only place which knows adapter classes, the rest of application uses DriverInterface */
const DRIVERS: {[dialect in SqlDialectType]: () => DriverInterface} = {
  mysql: () => new MysqlAdapter(),
  postgresql: () => new PostgresAdapter(),
};


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
    const create = DRIVERS[engine.dialect];
    if (!create) {
      throw new Error(`Driver of ${engine.label} is missing`);
    }
    DriverFactory.drivers[connection.id] = create();
    return DriverFactory.drivers[connection.id];
  }
}

export default DriverFactory;
