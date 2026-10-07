import ConnectionRequestInterface from './Interface/ConnectionRequestInterface';
import DriverFactory from '../Driver/DriverFactory';
import EstablishConnectionResultInterface from './Interface/EstablishConnectionResultInterface';
import JWT from '../JWT/JWT';
import AbstractCommandHandler from '../Websocket/CommandHandler/AbstractCommandHandler';
import DriverInterface from '../Driver/DriverInterface';

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
    return null;
  }

  connect(connectionData: ConnectionRequestInterface):Promise<EstablishConnectionResultInterface> {
    let driver: DriverInterface;
    try {
      // throws for invalid dsn or not supported driver
      driver = this.driverFactory.getDriver(connectionData);
    } catch (e) {
      return Promise.resolve(EstablishConnection.failed(e));
    }

    return driver.connect().then(() => {
      return {
        driver: driver,
        userData: {
          token: JWT.getJwtToken({username: connectionData.userData.username}),
          username: connectionData.userData.username,
        },
        error: null,
      };
    }).catch((e) => EstablishConnection.failed(e));
  }

  private static failed(error: any): EstablishConnectionResultInterface {
    return {
      driver: null,
      userData: null,
      error: AbstractCommandHandler.errorToString(error),
    };
  }
}

export default EstablishConnection;
