import DriverInterface from '../../Driver/DriverInterface';

interface EstablishConnectionResultInterface {
  driver: DriverInterface|null;
  username: string|null;
  error: string|null;
  /** host key of SSH server is unknown or changed - user can confirm it */
  sshHostKey?: {fingerprint: string, changed: boolean};
}
export default EstablishConnectionResultInterface;
