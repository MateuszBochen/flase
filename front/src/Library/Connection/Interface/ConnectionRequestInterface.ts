import ConnectionUserDataInterface from './ConnectionUserDataInterface';
import ConnectionDataInterface from './ConnectionDataInterface';

interface ConnectionRequestInterface {
  userData: ConnectionUserDataInterface;
  connectionData: ConnectionDataInterface;
  /** after successful login: true = password is remembered in browser, false = forgotten, missing = unchanged; not sent to server */
  rememberPassword?: boolean;
}

export default ConnectionRequestInterface;
