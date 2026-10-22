import ConnectionRequestInterface from './Interface/ConnectionRequestInterface';
import DriverFactory from '../Driver/DriverFactory';
import EstablishConnectionResultInterface from './Interface/EstablishConnectionResultInterface';
import AbstractCommandHandler from '../Websocket/CommandHandler/AbstractCommandHandler';
import DriverInterface from '../Driver/DriverInterface';
import Settings from '../Settings/Settings';
import SshTunnel, {SshHostKeyError} from '../Driver/Ssh/SshTunnel';

/** */
class EstablishConnection {
  private driverFactory: DriverFactory;
  constructor() {
    this.driverFactory = new DriverFactory();
  }

  /** returns null when request has invalid shape, otherwise description of the problem */
  static validate(data: any): string | null {
    if (!data || typeof data !== 'object') {
      return 'Invalid request body';
    }
    if (typeof data.userData?.username !== 'string' || typeof data.userData?.password !== 'string') {
      return 'userData.username and userData.password are required';
    }
    if (typeof data.connectionData?.dsn !== 'string' || !data.connectionData.dsn) {
      return 'connectionData.dsn is required';
    }
    return SshTunnel.validate(data.connectionData.ssh, data.userData.ssh);
  }

  connect(connectionData: ConnectionRequestInterface):Promise<EstablishConnectionResultInterface> {
    let driver: DriverInterface;
    try {
      // throws for invalid dsn or not supported driver
      driver = this.driverFactory.getDriver(connectionData);
    } catch (e) {
      return Promise.resolve(EstablishConnection.failed(e));
    }

    // errors thrown synchronously (e.g. invalid sslmode of DSN) are reported like failed login
    return Promise.resolve().then(() => driver.connect()).then(() => {
      return {
        driver: driver,
        username: connectionData.userData.username,
        error: null,
      };
    }).catch((e) => e instanceof SshHostKeyError
      ? {...EstablishConnection.failed(e.message), sshHostKey: {fingerprint: e.fingerprint, changed: e.changed}}
      : EstablishConnection.failed(EstablishConnection.explain(e)));
  }

  /** errors of network say nothing to user - what probably is wrong */
  private static explain(error: any): any {
    const message = AbstractCommandHandler.errorToString(error);
    const seconds = Math.round(Settings.getConnectTimeoutMs() / 1000);
    if (error?.code === 'ETIMEDOUT' || /connection timeout|timeout expired/i.test(message)) {
      return `Database server did not respond in ${seconds} s - check host, port and firewall (${message})`;
    }
    if (error?.code === 'PROTOCOL_SEQUENCE_TIMEOUT' || /^Handshake inactivity timeout/.test(message)) {
      return `Server did not answer as MySQL / MariaDB in ${seconds} s - check port and driver of DSN (${message})`;
    }
    if (error?.code === 'ECONNREFUSED') {
      return `Connection refused - database server does not listen on this host and port (${message})`;
    }
    return error;
  }

  private static failed(error: any): EstablishConnectionResultInterface {
    return {
      driver: null,
      username: null,
      error: AbstractCommandHandler.errorToString(error),
    };
  }
}

export default EstablishConnection;
