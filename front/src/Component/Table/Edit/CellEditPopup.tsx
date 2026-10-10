import React, {KeyboardEvent, useState} from 'react';
import Popup from '../../../UI/Popup/Popup';
import Button from '../../../UI/Button/Button';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {CellValueType} from '../Interface/RecordsViewPropsInterface';
import {isBinaryValue} from '../../../Library/Record/BinaryValue';
import CellEditor from './CellEditor';
import ValueEditor from './ValueEditor';

interface CellEditPopupPropsInterface {
  column: ColumnInterface;
  value: CellValueType | undefined;
  onSave: (value: CellValueType) => void;
  onClose: () => void;
}

/** texts are edited in big text area - inline editor in narrow column shows only few characters */
const isTextColumn = (column: ColumnInterface): boolean => !column.enumValues && /char|text|json|clob|string/i.test(column.type || '');

/**
 * CellEditPopup - "Edit cell…" from context menu
 * text columns - value editor with big text area (NULL, JSON formatting), other types - editor matching type in popup
 */
export default (props: CellEditPopupPropsInterface) => {
  const [value, setValue] = useState<CellValueType>(props.value === undefined ? null : props.value);

  if (isTextColumn(props.column) && !isBinaryValue(props.value)) {
    return <ValueEditor column={props.column} value={props.value} editable={true} onSave={props.onSave} onClose={props.onClose} />;
  }

  const save = () => props.onSave(value);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement)) {
      event.preventDefault();
      save();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      props.onClose();
    }
  };

  return (
    <Popup
      isOpen={true}
      label={`${props.column.name}  ·  ${props.column.type || ''}`}
      onClickOk={save}
      buttons={[
        <Button key="save" size="small" colorVariant="success" label="Save" onClick={save} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onClose} />,
      ]}
    >
      <div className="cmp-cell-edit-popup" onKeyDown={onKeyDown}>
        <CellEditor mode="form" autoFocus column={props.column} value={props.value === undefined ? null : props.value} onChange={setValue} />
        <div className="hint">Enter saves, Esc cancels. Change is pending until changes are submitted.</div>
      </div>
    </Popup>
  );
}
