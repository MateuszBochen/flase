import {SshSecretsInterface} from '../../Driver/Ssh/SshTunnel';

interface ConnectionUserDataInterface {
  username: string,
  password: string,
  /** password / private key of SSH tunnel */
  ssh?: SshSecretsInterface,
}

export default ConnectionUserDataInterface;
