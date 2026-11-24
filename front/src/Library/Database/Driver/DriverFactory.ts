import ConnectionDataInterface from '../../Connection/Interface/ConnectionDataInterface';
import DriverInterface from './DriverInterface';
import {parseConnectionDsnOrThrow} from '../../Connection/Dsn';
import MysqlAdapter from './Adapter/MySql/MysqlAdapter';
import PostgresAdapter from './Adapter/Postgres/PostgresAdapter';
import {engineOfScheme} from '../../Connection/Engines';
import SqlDialectType from './SqlDialectType';
import TableInformationInterface from '../../Table/Interface/TableInformationInterface';

/** driver of each family - the only place which knows adapter classes, the rest of application uses DriverInterface */
const DRIVERS: {[dialect in SqlDialectType]: () => DriverInterface} = {
  mysql: () => new MysqlAdapter(),
  postgresql: () => new PostgresAdapter(),
};


class DriverFactory {

  /**
   * the first parse of SQL compiles the parser (measured: ~9 ms, next ones ~1 ms) - it is done while browser is idle,
   * not when the first table is opened and its query waits for it
   */
  private static warmUp(driver: DriverInterface): void {
    const run = () => {
      try {
        driver.getDefaultQuery({tableName: 'warm_up'} as TableInformationInterface);
      } catch (e) {
        // only warm up
      }
    };
    if (typeof window === 'undefined') return;
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(run, {timeout: 2000});
    } else {
      setTimeout(run, 200);
    }
  }

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
    const driver = create();
    DriverFactory.drivers[connection.id] = driver;
    DriverFactory.warmUp(driver);
    return driver;
  }
}

export default DriverFactory;
