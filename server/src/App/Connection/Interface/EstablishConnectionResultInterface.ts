import DriverInterface from '../../Driver/DriverInterface';
import EstablishedUser from './EstablishedUser';

interface EstablishConnectionResultInterface {
  driver: DriverInterface|null;
  userData: EstablishedUser|null;
}
export default EstablishConnectionResultInterface;
