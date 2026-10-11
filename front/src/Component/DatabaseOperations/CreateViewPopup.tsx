import React, {useState} from 'react';
import Popup from '../../UI/Popup/Popup';
import Button from '../../UI/Button/Button';
import {DatabaseOperationType} from '../../Library/Database/Interface/DatabaseOperationInterface';
import '../Application/TableRecords/Structure/style.css';

interface CreateViewPopupPropsInterface {
  database: string;
  select: string;
  busy: boolean;
  onPreview: (operation: DatabaseOperationType) => void;
  onCancel: () => void;
}

/** CreateViewPopup - name of view created from query */
export default (props: CreateViewPopupPropsInterface) => {
  const [name, setName] = useState<string>('');
  const [replace, setReplace] = useState<boolean>(false);
  const preview = () => name.trim() && props.onPreview({kind: 'createView', database: props.database, name: name.trim(), select: props.select, replace});

  return (
    <Popup
      isOpen={true}
      label={`Create view in ${props.database}`}
      onClickOk={preview}
      buttons={[
        <Button key="preview" size="small" colorVariant="success" label="Preview SQL" onClick={preview} loading={props.busy} disabled={!name.trim()} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onCancel} />,
      ]}
    >
      <form className="cmp-structure-form" onSubmit={(event) => { event.preventDefault(); preview(); }}>
        <label>View name<input value={name} onChange={(event) => setName(event.target.value)} autoFocus aria-label="View name" /></label>
        <label className="checkbox"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} />Replace existing view (OR REPLACE)</label>
        <pre className="cmp-sql-preview">{props.select}</pre>
        <button type="submit" hidden />
      </form>
    </Popup>
  );
}
