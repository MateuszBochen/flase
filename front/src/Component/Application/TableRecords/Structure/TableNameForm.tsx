import React, {useState} from 'react';
import Popup from '../../../../UI/Popup/Popup';
import Button from '../../../../UI/Button/Button';

interface TableNameFormPropsInterface {
  mode: 'rename' | 'copy';
  currentName: string;
  busy: boolean;
  onPreview: (newName: string, withData: boolean) => void;
  onCancel: () => void;
}

/** TableNameForm - new name for rename / copy of table */
export default (props: TableNameFormPropsInterface) => {
  const [newName, setNewName] = useState<string>(props.mode === 'copy' ? `${props.currentName}_copy` : props.currentName);
  const [withData, setWithData] = useState<boolean>(true);

  const preview = () => props.onPreview(newName.trim(), withData);
  const unchanged = !newName.trim() || newName.trim() === props.currentName;

  return (
    <Popup
      isOpen={true}
      label={props.mode === 'copy' ? `Copy table ${props.currentName}` : `Rename table ${props.currentName}`}
      onClickOk={preview}
      buttons={[
        <Button key="preview" size="small" colorVariant="success" label="Preview SQL" onClick={preview} loading={props.busy} disabled={unchanged} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onCancel} />,
      ]}
    >
      <div className="cmp-structure-form">
        <label>New name<input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus /></label>
        {props.mode === 'copy' && (
          <>
            <label className="checkbox"><input type="checkbox" checked={withData} onChange={(e) => setWithData(e.target.checked)} />Copy data</label>
            <div className="hint">Structure and indexes are copied (CREATE TABLE … LIKE). Foreign keys and triggers are not.</div>
          </>
        )}
      </div>
    </Popup>
  );
}
