import React, {KeyboardEvent, useState} from 'react';
import Popup from '../../../UI/Popup/Popup';
import Button from '../../../UI/Button/Button';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {CellValueType} from '../Interface/RecordsViewPropsInterface';
import {isBinaryColumn, isBinaryValue, isLongText} from '../../../Library/Record/BinaryValue';
import CellEditor from './CellEditor';
import ValueEditor from './ValueEditor';

interface CellEditPopupPropsInterface {
  column: ColumnInterface;
  value: CellValueType | undefined;
  onSave: (value: CellValueType) => void;
  onClose: () => void;
  /** whole long text (grid has only its beginning) */
  loadText?: () => Promise<string> | null;
}

/** texts are edited in big text area - inline editor in narrow column shows only few characters */
const isTextColumn = (column: ColumnInterface): boolean => !column.enumValues && /char|text|json|clob|string/i.test(column.type || '');

/**
 * CellEditPopup - "Edit cell…" from context menu
 * text columns - value editor with big text area (NULL, JSON formatting), binary columns - value editor with hex, text and file,
 * other types - editor matching type in popup
 */
export default (props: CellEditPopupPropsInterface) => {
  const [value, setValue] = useState<CellValueType>(props.value === undefined ? null : props.value);

  if ((isTextColumn(props.column) && !isBinaryValue(props.value)) || isBinaryColumn(props.column) || isBinaryValue(props.value) || isLongText(props.value)) {
    // binary value is kept in the same form as values from server
    return <ValueEditor column={props.column} value={props.value} editable={true} loadText={props.loadText} onSave={(value) => props.onSave(value as CellValueType)} onClose={props.onClose} />;
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
      openOnMount
      label={`${props.column.name}  ·  ${props.column.type || ''}`}
      onClickOk={save}
      onClose={props.onClose}
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
