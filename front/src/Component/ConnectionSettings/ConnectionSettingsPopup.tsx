import React, {useState} from 'react';
import Popup from '../../UI/Popup/Popup';
import Button from '../../UI/Button/Button';
import ConnectionDataInterface from '../../Library/Connection/Interface/ConnectionDataInterface';
import ConnectionSettings from '../../Library/Connection/ConnectionSettings';
import {CONNECTION_COLORS} from '../../Library/Connection/ConnectionColors';
import toast from 'react-hot-toast';
import './style.css';

interface ConnectionSettingsPopupPropsInterface {
  connection: ConnectionDataInterface;
  onClose: () => void;
}

/** ConnectionSettingsPopup - name, color, read only mode and confirmation of connection */
export default (props: ConnectionSettingsPopupPropsInterface) => {
  const [displayName, setDisplayName] = useState<string>(props.connection.displayName);
  const [color, setColor] = useState<string>(props.connection.color || '');
  const [readOnly, setReadOnly] = useState<boolean>(!!props.connection.readOnly);
  const [confirm, setConfirm] = useState<boolean>(props.connection.changeConfirmationRequired);

  const save = () => {
    if (!displayName.trim()) {
      toast.error('Name is required');
      return;
    }
    const saved = ConnectionSettings.getInstance().updateConnection(props.connection.id, {
      displayName: displayName.trim(),
      color: color || undefined,
      readOnly,
      changeConfirmationRequired: confirm,
    });
    if (saved) {
      toast.success('Connection settings saved');
      props.onClose();
    }
  };

  return (
    <Popup
      isOpen={true}
      label={`Connection ${props.connection.displayName}`}
      onClickOk={save}
      buttons={[
        <Button key="save" size="small" colorVariant="success" label="Save" onClick={save} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onClose} />,
      ]}
    >
      <div className="cmp-connection-settings">
        <label>Name<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoFocus /></label>
        <div className="readonly-field"><span>DSN</span>{props.connection.dsn}</div>
        <div className="readonly-field"><span>User</span>{props.connection.username || '—'}</div>
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
      </div>
    </Popup>
  );
}
