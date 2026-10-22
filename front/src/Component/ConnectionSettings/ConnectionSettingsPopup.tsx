import React, {useEffect, useState} from 'react';
import Popup from '../../UI/Popup/Popup';
import Button from '../../UI/Button/Button';
import ConnectionDataInterface from '../../Library/Connection/Interface/ConnectionDataInterface';
import ConnectionSettings from '../../Library/Connection/ConnectionSettings';
import ConnectionManager from '../../Library/Connection/ConnectionManager';
import toast from 'react-hot-toast';
import PasswordVault from '../../Library/Connection/PasswordVault';
import EventBus from '../../Library/EventBus/EventBus';
import ConnectionFormWasSubmitted from '../ConnectionForm/Event/ConnectionFormWasSubmitted';
import useConnectionForm from '../Application/NewDatabaseConnection/useConnectionForm';
import './style.css';

interface ConnectionSettingsPopupPropsInterface {
  connection: ConnectionDataInterface;
  onClose: () => void;
}

/** ConnectionSettingsPopup - edit with the same form as new connection, disconnect and delete of saved connection */
export default (props: ConnectionSettingsPopupPropsInterface) => {
  const manager = ConnectionManager.getInstance();
  const [connected, setConnected] = useState<boolean>(manager.checkIfConnectionIsActive(props.connection));
  const form = useConnectionForm({connection: props.connection, locked: connected});
  const [passwordSaved, setPasswordSaved] = useState<boolean>(false);

  useEffect(() => {
    PasswordVault.has(props.connection.id).then(setPasswordSaved);
  }, [props.connection.id]);

  const forgetPassword = () => {
    PasswordVault.remove(props.connection.id)
      .then(() => {
        setPasswordSaved(false);
        toast.success('Saved password was forgotten');
      })
      .catch(() => toast.error('Password could not be removed'));
  };

  const save = (connect: boolean) => {
    const data = form.validated();
    if (!data) return;
    const id = props.connection.id;
    // saved password belongs to the user it was saved with
    if (!connected && passwordSaved && data.username !== props.connection.username) {
      PasswordVault.remove(id).catch(() => undefined);
      setPasswordSaved(false);
      toast('Saved password was forgotten - user was changed');
    }
    const saved = ConnectionSettings.getInstance().updateConnection(id, {
      displayName: data.displayName,
      // address of open session cannot be changed
      ...(connected ? {} : {dsn: data.dsn, username: data.username, ssh: data.ssh}),
      color: data.color,
      readOnly: data.readOnly,
      changeConfirmationRequired: data.changeConfirmationRequired,
    });
    if (!saved) return;
    toast.success('Connection settings saved');
    if (connect) {
      const connectionData = ConnectionSettings.getInstance().getConnection(id) || data;
      EventBus.emit(new ConnectionFormWasSubmitted({userData: form.userData(), connectionData,
        rememberPassword: form.rememberPassword || undefined}));
    }
    props.onClose();
  };

  const disconnect = () => {
    try {
      manager.disconnect(manager.getEstablishedConnection(props.connection), false);
      toast.success(`Disconnected from ${props.connection.displayName}`);
    } catch (e) {
      // it was not connected
    }
    setConnected(false);
  };

  const remove = () => {
    if (manager.checkIfConnectionIsActive(props.connection)) {
      disconnect();
    }
    ConnectionSettings.getInstance().removeConnection(props.connection.id);
    toast.success(`Connection ${props.connection.displayName} was deleted`);
    props.onClose();
  };

  if (props.connection.predefined) {
    return (
      <Popup
        openOnMount
        label={`Connection ${props.connection.displayName}`}
        onClickOk={props.onClose}
        onClose={props.onClose}
        buttons={[
          <Button key="close" size="small" label="Close" onClick={props.onClose} />,
          ...(connected ? [<Button key="disconnect" size="small" label="Disconnect" onClick={disconnect} />] : []),
          ...(passwordSaved ? [<Button key="forget" size="small" label="Forget saved password" onClick={forgetPassword} />] : []),
        ]}
      >
        <div className="cmp-connection-settings managed">
          <dl>
            <dt>Name</dt><dd>{props.connection.displayName}</dd>
            <dt>DSN</dt><dd><code>{props.connection.dsn}</code></dd>
            {props.connection.username && <><dt>Default user</dt><dd>{props.connection.username}</dd></>}
            {props.connection.sshTunnel && <><dt>SSH tunnel</dt><dd>yes - configured on server</dd></>}
            <dt>Read only</dt><dd>{props.connection.readOnly ? 'yes - enforced by server' : 'no'}</dd>
            <dt>Confirm every change</dt><dd>{props.connection.changeConfirmationRequired ? 'yes' : 'no'}</dd>
          </dl>
          <div className="hint">Connection is defined by administrator in configuration of Flase server (FLASE_CONNECTIONS) - it cannot be changed or deleted here.</div>
        </div>
      </Popup>
    );
  }

  return (
    <Popup
      openOnMount
      label={`Edit connection ${props.connection.displayName}`}
      onClickOk={() => save(false)}
      onClose={props.onClose}
      buttons={[
        <Button key="save" size="small" colorVariant="success" label="Save" onClick={() => save(false)} />,
        ...(connected ? [] : [
          <Button key="connect" size="small" colorVariant="success" label="Save & connect" onClick={() => save(true)} />,
          <Button key="test" size="small" label="Test connection" loading={form.test.status === 'testing'} onClick={form.testConnection} />,
        ]),
        <Button key="cancel" size="small" label="Cancel" onClick={props.onClose} />,
        ...(connected ? [<Button key="disconnect" size="small" label="Disconnect" onClick={disconnect} />] : []),
        ...(passwordSaved ? [<Button key="forget" size="small" label="Forget saved password" onClick={forgetPassword} />] : []),
        <Button key="delete" size="small" colorVariant="danger" label="Hold to delete connection" onClick={remove} />,
      ]}
    >
      <form
        className="cmp-new-connection in-popup"
        noValidate
        onSubmit={(event) => event.preventDefault()}
        // buttons are in popup, not in form - Enter in field saves
        onKeyDown={(event) => {
          if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type !== 'checkbox') {
            event.preventDefault();
            save(false);
          }
        }}
      >
        {form.fields}
        <div className="popup-footer-info">
          {form.testResult}
          <div className="field-hint">Delete removes only the saved connection (and its tabs), nothing is changed in database.</div>
        </div>
      </form>
    </Popup>
  );
}
