import ConnectionRequestInterface from '../Connection/Interface/ConnectionRequestInterface';
import MysqlAdapter from './Drivers/Mysql/MysqlAdapter';
import PostgresAdapter from './Drivers/Postgres/PostgresAdapter';
import DriverInterface from './DriverInterface';
import {parseDsnOrThrow, ParsedDsn} from '@soluble/dsn-parser';
import {engineOfScheme} from './Engines';

/** stands for IPv6 address while DSN is parsed - parser does not know [::1] */
const IPV6_PLACEHOLDER = 'flase-ipv6-host';

/**
 * Driver class factory.
 */
class DriverFactory {

  /**
   * Metod taking name and connection data to create new data driver.
   */
  getDriver(connectionData: ConnectionRequestInterface): DriverInterface
  {
    const parsedDsn = DriverFactory.parseDsn(connectionData.connectionData.dsn);
    const engine = engineOfScheme(parsedDsn.driver);
    if (!engine) {
      throw new Error(`Given ${parsedDsn.driver} is not supported yet`);
    }
    // compatible engines (MariaDB, TiDB / CockroachDB, YugabyteDB) speak protocol of their family - differences are in the driver
    const dsn = {...parsedDsn, port: parsedDsn.port || engine.port};
    return engine.dialect === 'mysql' ? new MysqlAdapter(connectionData, dsn) : new PostgresAdapter(connectionData, dsn);
  }

  /** DSN with IPv6 host ([::1]), trailing slash without database (mysql://db:3306/), port 1 - 65535 */
  static parseDsn(dsn: string): ParsedDsn {
    let ipv6: string | null = null;
    const prepared = dsn.trim()
      .replace(/^([\w+.-]+:\/\/(?:[^@/?]*@)?)\[([0-9a-fA-F:.]+)\]/, (match, prefix: string, address: string) => {
        ipv6 = address;
        return prefix + IPV6_PLACEHOLDER;
      })
      .replace(/^([\w+.-]+:\/\/[^/?]+)\/(?=\?|$)/, '$1');
    const parsed = parseDsnOrThrow(prepared);
    if (ipv6 !== null && parsed.host === IPV6_PLACEHOLDER) {
      parsed.host = ipv6;
    }
    if (parsed.port !== undefined && (parsed.port < 1 || parsed.port > 65535)) {
      throw new Error(`Can't parse dsn: Invalid port: ${parsed.port}`);
    }
    return parsed;
  }
}

export default DriverFactory;
