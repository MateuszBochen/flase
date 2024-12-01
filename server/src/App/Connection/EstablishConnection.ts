import ConnectionRequestInterface from './Interface/ConnectionRequestInterface';
import DriverFactory from '../Driver/DriverFactory';
import EstablishConnectionResultInterface from './Interface/EstablishConnectionResultInterface';
import JWT from '../JWT/JWT';

/** */
class EstablishConnection {
  private driverFactory: DriverFactory;
  constructor() {
    this.driverFactory = new DriverFactory();
  }

  connect(connectionData: ConnectionRequestInterface):Promise<EstablishConnectionResultInterface> {
    const driver = this.driverFactory.getDriver(connectionData);
    return driver.connect().then(() => {
      return {
        driver: driver,
        userData: {
          token: JWT.getJwtToken({username: connectionData.userData.username}),
          username: connectionData.userData.username,
        }
      };
    }).catch(() => {
      return {
        driver: null,
        userData: null,
      };
    });
  }
}

export default EstablishConnection;
