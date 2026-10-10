import DriverInterface from '../../Driver/DriverInterface';

interface EstablishConnectionResultInterface {
  driver: DriverInterface|null;
  username: string|null;
  error: string|null;
}
export default EstablishConnectionResultInterface;
