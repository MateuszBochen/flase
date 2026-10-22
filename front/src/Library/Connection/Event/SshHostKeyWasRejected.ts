import EventInterface from '../../EventBus/EventInterface';
import ConnectionRequestInterface from '../Interface/ConnectionRequestInterface';
import {SshHostKeyInterface} from '../Ssh/SshTunnelInterface';

export type SshHostKeyRejectionType = {request: ConnectionRequestInterface, hostKey: SshHostKeyInterface};

/**
 * Login refused - host key of SSH server is unknown or changed; user can confirm it and connect again
 */
class SshHostKeyWasRejected implements EventInterface<SshHostKeyRejectionType> {
  private readonly rejection: SshHostKeyRejectionType;

  constructor(rejection: SshHostKeyRejectionType) {
    this.rejection = rejection;
  }

  getData(): SshHostKeyRejectionType {
    return this.rejection;
  }
}

export default SshHostKeyWasRejected;
