import React, {useEffect, useState} from 'react';
import {createPortal} from 'react-dom';
import Popup from '../../UI/Popup/Popup';
import Button from '../../UI/Button/Button';
import EventBus from '../../Library/EventBus/EventBus';
import EventInterface from '../../Library/EventBus/EventInterface';
import SshHostKeyWasRejected, {SshHostKeyRejectionType} from '../../Library/Connection/Event/SshHostKeyWasRejected';
import ConnectionSettings from '../../Library/Connection/ConnectionSettings';
import ConnectionFormWasSubmitted from '../ConnectionForm/Event/ConnectionFormWasSubmitted';
import {sshAddress} from '../../Library/Connection/Ssh/SshTunnelInterface';
import './style.css';

/**
 * SshHostKeyPrompt - host key of SSH server is not known (first connection) or changed; like ssh asks
 * "Are you sure you want to continue connecting?" - confirmed key is saved with connection, login runs again
 */
export default () => {
  const [rejection, setRejection] = useState<SshHostKeyRejectionType | null>(null);

  useEffect(() => {
    const id = EventBus.subscribe(SshHostKeyWasRejected.name, (event: EventInterface<SshHostKeyRejectionType>) => setRejection(event.getData()));
    return () => EventBus.unSub(id);
  }, []);

  if (!rejection || !rejection.request.connectionData.ssh) {
    return null;
  }
  const {request, hostKey} = rejection;
  const ssh = request.connectionData.ssh!;
  const close = () => setRejection(null);

  const trust = () => {
    const id = request.connectionData.id;
    const confirmed = {...ssh, hostKey: hostKey.fingerprint};
    // saved connection is changed in place - the request has the same object
    ConnectionSettings.getInstance().updateConnection(id, {ssh: confirmed});
    const connectionData = ConnectionSettings.getInstance().getConnection(id) || {...request.connectionData, ssh: confirmed};
    setRejection(null);
    EventBus.emit(new ConnectionFormWasSubmitted({...request, connectionData}));
  };

  // over the open popup of connect form (it waits for result of login)
  return createPortal((
    <Popup
      openOnMount
      label={hostKey.changed ? 'Host key of SSH server has changed!' : 'Unknown SSH server'}
      onClickOk={close}
      onClose={close}
      buttons={[
        <Button
          key="trust"
          size="small"
          colorVariant={hostKey.changed ? 'danger' : 'success'}
          label={hostKey.changed ? 'Hold to trust new key and connect' : 'Trust and connect'}
          onClick={trust}
        />,
        <Button key="cancel" size="small" label="Cancel" onClick={close} />,
      ]}
    >
      <div className={`cmp-ssh-host-key ${hostKey.changed ? 'changed' : ''}`}>
        {hostKey.changed ? (
          <p>
            <strong>{sshAddress(ssh)}</strong> presents a different host key than the one confirmed before. The server may have been
            reinstalled - or someone is intercepting the connection (man in the middle). Do not continue unless you know why the key changed.
          </p>
        ) : (
          <p>
            Connection <strong>{request.connectionData.displayName}</strong> goes through SSH server <strong>{sshAddress(ssh)}</strong>,
            which is connected for the first time. Check that its key is the expected one before you trust it.
          </p>
        )}
        <dl>
          {hostKey.changed && ssh.hostKey && <><dt>Confirmed key</dt><dd><code>{ssh.hostKey}</code></dd></>}
          <dt>{hostKey.changed ? 'New key' : 'Host key'}</dt><dd><code className="fingerprint">{hostKey.fingerprint}</code></dd>
        </dl>
        <div className="hint">
          Fingerprint can be checked on the SSH server: <code>ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub</code>
        </div>
      </div>
    </Popup>
  ), document.body);
}
