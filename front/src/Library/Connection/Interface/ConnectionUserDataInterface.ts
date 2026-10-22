

import {SshSecretsInterface} from '../Ssh/SshTunnelInterface';

interface ConnectionUserDataInterface {
  username: string,
  password: string,
  /** password / private key of SSH tunnel */
  ssh?: SshSecretsInterface,
}

export default ConnectionUserDataInterface;
