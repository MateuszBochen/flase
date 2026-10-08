import React, {useState} from 'react';
import DriverFeaturesInterface from '../../../../Library/Database/Driver/DriverFeaturesInterface';
import Popup from '../../../../UI/Popup/Popup';
import Button from '../../../../UI/Button/Button';
import {StructureColumnInterface} from '../../../../Library/Table/Interface/TableStructureInterface';
import {
  ColumnDefaultType,
  ColumnDefinitionInterface,
  ColumnPositionType,
} from '../../../../Library/Table/Interface/StructureChangeInterface';

interface ColumnFormPropsInterface {
  features: DriverFeaturesInterface;
  /** undefined for new column */
  column?: StructureColumnInterface;
  /** new column is placed after this one */
  after?: string;
  columns: StructureColumnInterface[];
  busy: boolean;
  onPreview: (definition: ColumnDefinitionInterface, position: ColumnPositionType) => void;
  onCancel: () => void;
}

type DefaultKind = ColumnDefaultType['kind'];

/** form values from existing column - SHOW COLUMNS escapes apostrophes in MySQL expressions */
const initialDefault = (column?: StructureColumnInterface): {kind: DefaultKind, value: string} => {
  if (!column || column.defaultValue === null) {
    return {kind: column?.nullable ? 'null' : 'none', value: ''};
  }
  if (column.defaultIsExpression) {
    return {kind: 'expression', value: column.defaultValue.replace(/\\'/g, "'")};
  }
  return {kind: 'value', value: column.defaultValue};
};

const isTimeType = (type: string) => /^(datetime|timestamp)/i.test(type.trim());

/** ColumnForm - add or change column, sql is always previewed before execution */
export default (props: ColumnFormPropsInterface) => {
  const isNew = !props.column;
  const [name, setName] = useState<string>(props.column?.name || '');
  const [type, setType] = useState<string>(props.column?.type || 'varchar(255)');
  const [nullable, setNullable] = useState<boolean>(props.column ? props.column.nullable : true);
  const [defaultKind, setDefaultKind] = useState<DefaultKind>(initialDefault(props.column).kind);
  const [defaultValue, setDefaultValue] = useState<string>(initialDefault(props.column).value);
  // MySQL auto_increment, PostgreSQL identity / serial
  const [autoIncrement, setAutoIncrement] = useState<boolean>(/auto_increment|identity|serial/i.test(props.column?.extra || ''));
  const [onUpdate, setOnUpdate] = useState<boolean>(/on update/i.test(props.column?.extra || ''));
  const [comment, setComment] = useState<string>(props.column?.comment || '');
  // database without column order (PostgreSQL) adds columns at the end
  const [position, setPosition] = useState<string>(isNew ? (props.after && props.features.columnPosition ? `after:${props.after}` : 'end') : 'keep');

  const otherColumns = props.columns.filter((column) => column.name !== props.column?.name);

  const preview = () => {
    let columnDefault: ColumnDefaultType;
    if (defaultKind === 'value' || defaultKind === 'expression') {
      columnDefault = {kind: defaultKind, value: defaultValue};
    } else {
      columnDefault = {kind: defaultKind};
    }

    let columnPosition: ColumnPositionType = {kind: 'end'};
    if (position === 'first') {
      columnPosition = {kind: 'first'};
    } else if (position.startsWith('after:')) {
      columnPosition = {kind: 'after', column: position.substring('after:'.length)};
    }

    props.onPreview({
      name: name.trim(),
      type: type.trim(),
      nullable,
      defaultValue: columnDefault,
      autoIncrement,
      onUpdateCurrentTimestamp: props.features.onUpdateTimestamp && onUpdate && isTimeType(type),
      comment,
      // keep collation of string column - otherwise table default would be used
      collation: props.column?.collation || null,
    }, columnPosition);
  };

  return (
    <Popup
      isOpen={true}
      label={isNew ? 'Add column' : `Change column ${props.column!.name}`}
      onClickOk={preview}
      buttons={[
        <Button key="preview" size="small" colorVariant="success" label="Preview SQL" onClick={preview} loading={props.busy} disabled={!name.trim() || !type.trim()} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onCancel} />,
      ]}
    >
      <div className="cmp-structure-form">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <label>
          Type
          <input value={type} onChange={(e) => setType(e.target.value)} list="structure-column-types" />
          <datalist id="structure-column-types">{props.features.columnTypes.map((item) => <option key={item} value={item} />)}</datalist>
        </label>
        <label className="checkbox"><input type="checkbox" checked={nullable} onChange={(e) => setNullable(e.target.checked)} />Nullable</label>
        <label>
          Default
          <div className="inline">
            <select value={defaultKind} onChange={(e) => setDefaultKind(e.target.value as DefaultKind)}>
              <option value="none">No default</option>
              <option value="null" disabled={!nullable}>NULL</option>
              <option value="value">Value</option>
              <option value="expression">Expression</option>
            </select>
            {(defaultKind === 'value' || defaultKind === 'expression') && (
              <input
                value={defaultValue}
                onChange={(e) => setDefaultValue(e.target.value)}
                placeholder={defaultKind === 'expression' ? 'CURRENT_TIMESTAMP' : ''}
              />
            )}
          </div>
        </label>
        <label className="checkbox"><input type="checkbox" checked={autoIncrement} onChange={(e) => setAutoIncrement(e.target.checked)} />Auto increment</label>
        {props.features.onUpdateTimestamp && isTimeType(type) && (
          <label className="checkbox"><input type="checkbox" checked={onUpdate} onChange={(e) => setOnUpdate(e.target.checked)} />On update CURRENT_TIMESTAMP</label>
        )}
        <label>Comment<input value={comment} onChange={(e) => setComment(e.target.value)} /></label>
        {props.features.columnPosition && <label>
          Position
          <select value={position} onChange={(e) => setPosition(e.target.value)}>
            {!isNew && <option value="keep">Keep position</option>}
            {isNew && <option value="end">At the end</option>}
            <option value="first">First</option>
            {otherColumns.map((column) => <option key={column.name} value={`after:${column.name}`}>After {column.name}</option>)}
          </select>
        </label>}
        {props.column?.collation && <div className="hint">Collation {props.column.collation} is kept.</div>}
      </div>
    </Popup>
  );
}
