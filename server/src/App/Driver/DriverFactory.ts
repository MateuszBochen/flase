import ConnectionRequestInterface from '../Connection/Interface/ConnectionRequestInterface';
import MysqlAdapter from './Drivers/Mysql/MysqlAdapter';
import PostgresAdapter from './Drivers/Postgres/PostgresAdapter';
import DriverInterface from './DriverInterface';
import {parseDsnOrThrow, ParsedDsn} from '@soluble/dsn-parser';

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
