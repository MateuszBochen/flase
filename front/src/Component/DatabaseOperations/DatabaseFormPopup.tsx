import React, {useState} from 'react';
import Popup from '../../UI/Popup/Popup';
import Button from '../../UI/Button/Button';
import ConnectionDataInterface from '../../Library/Connection/Interface/ConnectionDataInterface';
import DriverFactory from '../../Library/Database/Driver/DriverFactory';
import useServerOptions from '../../Library/Database/useServerOptions';
import {DatabaseOperationType} from '../../Library/Database/Interface/DatabaseOperationInterface';
import CollationSelect from './CollationSelect';
import '../Application/TableRecords/Structure/style.css';

export type DatabaseFormModeType = 'create' | 'rename' | 'collation';

interface DatabaseFormPopupPropsInterface {
  connection: ConnectionDataInterface;
  mode: DatabaseFormModeType;
  /** database of rename / collation */
  database?: string;
  /** current collation of database */
  collation?: string | null;
  busy: boolean;
  onPreview: (operation: DatabaseOperationType) => void;
  onCancel: () => void;
}

/** DatabaseFormPopup - create database (schema), rename it or change its collation; sql is previewed before execution */
export default (props: DatabaseFormPopupPropsInterface) => {
  const driver = DriverFactory.getDriver(props.connection);
  const label = driver.features.databaseLabel;
  const isMysql = driver.dialect === 'mysql';
  const options = useServerOptions(props.connection);
  const [name, setName] = useState<string>(props.mode === 'rename' ? props.database || '' : '');
  const [collation, setCollation] = useState<string>(props.collation || '');
  const [convertTables, setConvertTables] = useState<boolean>(false);

  const preview = () => {
    switch (props.mode) {
      case 'create':
        props.onPreview({kind: 'createDatabase', name: name.trim(), collation: collation || null});
        break;
      case 'rename':
        props.onPreview({kind: 'renameDatabase', name: props.database!, newName: name.trim()});
        break;
      case 'collation':
        props.onPreview({kind: 'alterDatabase', name: props.database!, collation, convertTables});
        break;
    }
  };

  const disabled = props.mode === 'collation'
    ? !collation
    : !name.trim() || (props.mode === 'rename' && name.trim() === props.database);

  const titles: {[mode in DatabaseFormModeType]: string} = {
    create: `Create ${label.toLowerCase()}`,
    rename: `Rename ${label.toLowerCase()} ${props.database}`,
    collation: `Collation of ${props.database}`,
  };

  return (
    <Popup
      openOnMount
      label={titles[props.mode]}
      onClickOk={preview}
      onClose={props.onCancel}
      buttons={[
        <Button key="preview" size="small" colorVariant="success" label="Preview SQL" onClick={preview} loading={props.busy} disabled={disabled} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onCancel} />,
      ]}
    >
      <form className="cmp-structure-form" onSubmit={(event) => { event.preventDefault(); if (!disabled) preview(); }}>
        {props.mode !== 'collation' && (
          <label>{props.mode === 'rename' ? 'New name' : 'Name'}<input value={name} onChange={(event) => setName(event.target.value)} autoFocus aria-label="Name" /></label>
        )}
        {isMysql && props.mode !== 'rename' && (
          <label>
            Collation
            <CollationSelect
              options={options}
              value={collation}
              onChange={setCollation}
              emptyLabel={props.mode === 'create' ? `Server default${options?.defaultCollation ? ` (${options.defaultCollation})` : ''}` : undefined}
              autoFocus={props.mode === 'collation'}
            />
          </label>
        )}
        {props.mode === 'collation' && (
          <>
            <label className="checkbox">
              <input type="checkbox" checked={convertTables} onChange={(event) => setConvertTables(event.target.checked)} />
              Convert all tables and their columns
            </label>
            <div className="hint">Without conversion only new tables get the collation. Conversion rewrites every table.</div>
          </>
        )}
        {props.mode === 'rename' && isMysql && (
          <div className="hint">Tables are moved to a new database. Databases with views, routines, triggers or events cannot be renamed this way.</div>
        )}
        <button type="submit" hidden />
      </form>
    </Popup>
  );
}
