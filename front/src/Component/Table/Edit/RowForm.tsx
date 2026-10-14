import React, {useState} from 'react';
import Popup from '../../../UI/Popup/Popup';
import Button from '../../../UI/Button/Button';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {CellValueType, SingleRowType} from '../Interface/RecordsViewPropsInterface';
import CellEditor from './CellEditor';
import ValueEditor from './ValueEditor';
import {binaryLabel, binaryOfBytes, isBinaryColumn, isBinaryValue} from '../../../Library/Record/BinaryValue';

interface RowFormPropsInterface {
  title: string;
  columns: ColumnInterface[];
  /** current values of row */
  values: SingleRowType;
  /** new row - columns which were not filled are left to database defaults */
  isNewRow: boolean;
  onSave: (values: SingleRowType) => void;
  onCancel: () => void;
}

/** RowForm - all columns of single row, one under another (good for wide tables and long texts) */
export default (props: RowFormPropsInterface) => {
  const [values, setValues] = useState<SingleRowType>({...props.values});
  /** binary column edited by value editor over the form */
  const [binaryColumn, setBinaryColumn] = useState<ColumnInterface | null>(null);

  const setValue = (columnKey: string, value: CellValueType) => {
    setValues((previous) => ({...previous, [columnKey]: value}));
  };

  const resetToDefault = (columnKey: string) => {
    setValues((previous) => {
      const next = {...previous};
      delete next[columnKey];
      return next;
    });
  };

  return (
    <Popup
      openOnMount
      label={props.title}
      onClickOk={() => props.onSave(values)}
      onClose={props.onCancel}
      buttons={[
        <Button key="save" size="small" colorVariant="success" label="Save" onClick={() => props.onSave(values)} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onCancel} />,
      ]}
    >
      <div className="cmp-row-form">
        {props.columns.map((column) => {
          const hasValue = column.key in values;
          return (
            <div className="row-form-field" key={`${column.alias}-${column.name}`}>
              <label className="row-form-label" title={column.type}>
                <span className="row-form-name">{column.name}</span>
                <span className="row-form-type">
                  {column.type}{column.primaryKey ? ' PK' : ''}{column.autoIncrement ? ' auto' : ''}
                </span>
              </label>
              <div className="row-form-editor">
                {!column.editable ? (
                  <span className="row-form-read-only">{values[column.key] === null ? 'NULL' : isBinaryValue(values[column.key]) ? binaryLabel(values[column.key] as any) : String(values[column.key] ?? '')}</span>
                ) : props.isNewRow && !hasValue ? (
                  <button type="button" className="row-form-default" onClick={() => isBinaryColumn(column) ? setBinaryColumn(column) : setValue(column.key, '')}>
                    {column.autoIncrement ? 'auto increment' : `DEFAULT${column.defaultValue !== null && column.defaultValue !== undefined ? ` (${column.defaultValue})` : ''}`} - click to set value
                  </button>
                ) : isBinaryColumn(column) || isBinaryValue(values[column.key]) ? (
                  <>
                    <button type="button" className="row-form-binary" title="Edit in value editor" onClick={() => setBinaryColumn(column)}>
                      {values[column.key] === null ? 'NULL' : isBinaryValue(values[column.key]) ? binaryLabel(values[column.key] as any) : String(values[column.key] ?? '')} - edit…
                    </button>
                    {props.isNewRow && (
                      <button type="button" className="row-form-use-default" onClick={() => resetToDefault(column.key)}>default</button>
                    )}
                  </>
                ) : (
                  <>
                    <CellEditor
                      mode="form"
                      column={column}
                      value={values[column.key] ?? null}
                      onChange={(value) => setValue(column.key, value)}
                    />
                    {props.isNewRow && (
                      <button type="button" className="row-form-use-default" onClick={() => resetToDefault(column.key)}>default</button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {binaryColumn && (
        <ValueEditor
          column={binaryColumn}
          value={binaryColumn.key in values ? values[binaryColumn.key] : binaryOfBytes(new Uint8Array(0))}
          editable={true}
          onSave={(value) => {
            // binary value is kept in the same form as values from server
            setValue(binaryColumn.key, value as CellValueType);
            setBinaryColumn(null);
          }}
          onClose={() => setBinaryColumn(null)}
        />
      )}
    </Popup>
  );
}
