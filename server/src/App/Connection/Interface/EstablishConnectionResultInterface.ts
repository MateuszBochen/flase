import DriverInterface from '../../Driver/DriverInterface';
import EstablishedUser from './EstablishedUser';

interface EstablishConnectionResultInterface {
  driver: DriverInterface|null;
  userData: EstablishedUser|null;
  error: string|null;
}
export default EstablishConnectionResultInterface;
