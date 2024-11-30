import ConnectionUserDataInterface from './ConnectionUserDataInterface';
import ConnectionDataInterface from './ConnectionDataInterface';

interface ConnectionRequestInterface {
  userData: ConnectionUserDataInterface;
  connectionData: ConnectionDataInterface;
}

export default ConnectionRequestInterface;
