import React, {useState} from 'react';
import Popup from '../../../../UI/Popup/Popup';
import Button from '../../../../UI/Button/Button';
import ConnectionDataInterface from '../../../../Library/Connection/Interface/ConnectionDataInterface';
import DriverFactory from '../../../../Library/Database/Driver/DriverFactory';
import useServerOptions from '../../../../Library/Database/useServerOptions';
import {StructureTableInfoInterface} from '../../../../Library/Table/Interface/TableStructureInterface';
import {StructureChangeType} from '../../../../Library/Table/Interface/StructureChangeInterface';
import CollationSelect from '../../../DatabaseOperations/CollationSelect';

interface TableOptionsFormPropsInterface {
  connection: ConnectionDataInterface;
  info: StructureTableInfoInterface;
  busy: boolean;
  onPreview: (change: StructureChangeType) => void;
  onCancel: () => void;
}

/** TableOptionsForm - engine, collation, comment and next auto increment value of table; only changed options are sent */
export default (props: TableOptionsFormPropsInterface) => {
  const driver = DriverFactory.getDriver(props.connection);
  const isMysql = driver.dialect === 'mysql';
  const options = useServerOptions(props.connection);
  const [engine, setEngine] = useState<string>(props.info.engine || '');
  const [collation, setCollation] = useState<string>(props.info.collation || '');
  const [convert, setConvert] = useState<boolean>(true);
  const [comment, setComment] = useState<string>(props.info.comment || '');
  const [autoIncrement, setAutoIncrement] = useState<string>(props.info.autoIncrement !== null ? String(props.info.autoIncrement) : '');

  const autoIncrementValue = autoIncrement.trim() === '' ? null : Number(autoIncrement);
  const change: StructureChangeType = {
    kind: 'options',
    engine: isMysql && engine && engine !== props.info.engine ? engine : null,
    collation: isMysql && collation && collation !== props.info.collation ? collation : null,
    convert,
    comment: comment !== (props.info.comment || '') ? comment : null,
    autoIncrement: autoIncrementValue !== null && autoIncrementValue !== props.info.autoIncrement ? autoIncrementValue : null,
  };
  const changed = change.kind === 'options' && (change.engine || change.collation || change.comment !== null || change.autoIncrement !== null);
  const invalidNumber = autoIncrementValue !== null && (!Number.isInteger(autoIncrementValue) || autoIncrementValue <= 0);

  const preview = () => changed && !invalidNumber && props.onPreview(change);

  return (
    <Popup
      isOpen={true}
      label="Table options"
      onClickOk={preview}
      buttons={[
        <Button key="preview" size="small" colorVariant="success" label="Preview SQL" onClick={preview} loading={props.busy} disabled={!changed || invalidNumber} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onCancel} />,
      ]}
    >
      <form className="cmp-structure-form" onSubmit={(event) => { event.preventDefault(); preview(); }}>
        {isMysql && (
          <label>
            Engine
            <select value={engine} onChange={(event) => setEngine(event.target.value)} aria-label="Engine">
              {engine && !(options?.engines || []).some((item) => item.name === engine) && <option value={engine}>{engine}</option>}
              {(options?.engines || []).map((item) => <option key={item.name} value={item.name}>{item.name}{item.isDefault ? ' (default)' : ''}</option>)}
            </select>
          </label>
        )}
        {isMysql && (
          <label>
            Collation
            <CollationSelect options={options} value={collation} onChange={setCollation} />
          </label>
        )}
        {isMysql && collation !== (props.info.collation || '') && (
          <label className="checkbox">
            <input type="checkbox" checked={convert} onChange={(event) => setConvert(event.target.checked)} />
            Convert existing columns (CONVERT TO CHARACTER SET)
          </label>
        )}
        <label>Comment<input value={comment} onChange={(event) => setComment(event.target.value)} aria-label="Comment" /></label>
        <label>
          Auto increment
          <input
            type="number"
            min={1}
            value={autoIncrement}
            onChange={(event) => setAutoIncrement(event.target.value)}
            placeholder={isMysql ? '' : 'next value of identity / serial'}
            aria-label="Auto increment"
          />
        </label>
        <div className="hint">
          {isMysql
            ? 'Auto increment is the next value; InnoDB does not allow value lower than the current maximum.'
            : 'Auto increment sets next value of identity / serial sequence of the table.'}
        </div>
        <button type="submit" hidden />
      </form>
    </Popup>
  );
}
