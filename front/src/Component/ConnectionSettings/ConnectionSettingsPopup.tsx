import React, {useState} from 'react';
import Popup from '../../UI/Popup/Popup';
import Button from '../../UI/Button/Button';
import ConnectionDataInterface from '../../Library/Connection/Interface/ConnectionDataInterface';
import ConnectionSettings from '../../Library/Connection/ConnectionSettings';
import ConnectionManager from '../../Library/Connection/ConnectionManager';
import {CONNECTION_COLORS} from '../../Library/Connection/ConnectionColors';
import toast from 'react-hot-toast';
import './style.css';

interface ConnectionSettingsPopupPropsInterface {
  connection: ConnectionDataInterface;
  onClose: () => void;
}

const SUPPORTED_DSN = /^(mysql|mariadb|postgresql|postgres|pgsql):\/\/\S+$/i;

/** ConnectionSettingsPopup - edit (name, DSN, user, color, read only), disconnect and delete of saved connection */
export default (props: ConnectionSettingsPopupPropsInterface) => {
  const manager = ConnectionManager.getInstance();
  const [connected, setConnected] = useState<boolean>(manager.checkIfConnectionIsActive(props.connection));
  const [displayName, setDisplayName] = useState<string>(props.connection.displayName);
  const [dsn, setDsn] = useState<string>(props.connection.dsn);
  const [username, setUsername] = useState<string>(props.connection.username || '');
  const [color, setColor] = useState<string>(props.connection.color || '');
  const [readOnly, setReadOnly] = useState<boolean>(!!props.connection.readOnly);
  const [confirm, setConfirm] = useState<boolean>(props.connection.changeConfirmationRequired);

  const save = () => {
    if (!displayName.trim()) {
      toast.error('Name is required');
      return;
    }
    if (!SUPPORTED_DSN.test(dsn.trim())) {
      toast.error('Supported DSN: mysql://, mariadb://, postgresql://');
      return;
    }
    const saved = ConnectionSettings.getInstance().updateConnection(props.connection.id, {
      displayName: displayName.trim(),
      // address of open session cannot be changed
      ...(connected ? {} : {dsn: dsn.trim(), username: username.trim()}),
      color: color || undefined,
      readOnly,
      changeConfirmationRequired: confirm,
    });
    if (saved) {
      toast.success('Connection settings saved');
      props.onClose();
    }
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

  return (
    <Popup
      isOpen={true}
      label={`Connection ${props.connection.displayName}`}
      onClickOk={save}
      buttons={[
        <Button key="save" size="small" colorVariant="success" label="Save" onClick={save} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onClose} />,
        ...(connected ? [<Button key="disconnect" size="small" label="Disconnect" onClick={disconnect} />] : []),
        <Button key="delete" size="small" colorVariant="danger" label="Hold to delete connection" onClick={remove} />,
      ]}
    >
      <div className="cmp-connection-settings">
        <label>Name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus /></label>
        <label>
          DSN
          <input value={dsn} onChange={(e) => setDsn(e.target.value)} disabled={connected}
            placeholder="mysql://host:3306 · mariadb://host:3306 · postgresql://host:5432/database" />
        </label>
        <label>User<input value={username} onChange={(e) => setUsername(e.target.value)} disabled={connected} /></label>
        {connected && <div className="hint">Disconnect to change DSN or user.</div>}
        <div className="color-field">
          <span>Color</span>
          <div className="color-options">
            {CONNECTION_COLORS.map((item) => (
              <button
                key={item.value || 'none'}
                type="button"
                title={item.label}
                className={`color-option ${color === item.value ? 'selected' : ''} ${item.value ? '' : 'none'}`}
                style={item.value ? {backgroundColor: item.value} : undefined}
                onClick={() => setColor(item.value)}
              />
            ))}
          </div>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
          Read only - editing, structure changes, import and statements changing data are refused
        </label>
        <label className="checkbox">
          <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
          Confirm every change (SQL preview before execution)
        </label>
        <div className="hint">Delete removes only the saved connection (and its tabs), nothing is changed in database.</div>
      </div>
    </Popup>
  );
}
