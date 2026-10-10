import React, {useMemo, useState} from 'react';
import Popup from '../../../UI/Popup/Popup';
import Button from '../../../UI/Button/Button';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {CellValueType} from '../Interface/RecordsViewPropsInterface';
import {BinaryValueInterface, formatBytes, hexDump, isBinaryValue} from '../../../Library/Record/BinaryValue';

interface ValueEditorPropsInterface {
  column: ColumnInterface;
  value: CellValueType | BinaryValueInterface | undefined;
  /** value can be changed - otherwise only shown */
  editable: boolean;
  onSave: (value: CellValueType) => void;
  onClose: () => void;
}

const parseJson = (text: string): {ok: boolean, value?: any, error?: string} => {
  try {
    return {ok: true, value: JSON.parse(text)};
  } catch (e: any) {
    return {ok: false, error: e?.message || String(e)};
  }
};

/** ValueEditor - long texts, JSON (format / minify) and binary values (hex / text) */
export default (props: ValueEditorPropsInterface) => {
  const binary = isBinaryValue(props.value) ? props.value : null;
  const initialText = binary || props.value === null || props.value === undefined ? '' : String(props.value);

  const [text, setText] = useState<string>(initialText);
  const [isNull, setIsNull] = useState<boolean>(props.value === null);
  const [wrap, setWrap] = useState<boolean>(true);
  const [binaryView, setBinaryView] = useState<'hex' | 'text'>(binary?.text !== null && binary?.text !== undefined ? 'text' : 'hex');

  const isJsonColumn = /^json/i.test(props.column.type || '');
  const looksLikeJson = /^\s*[[{]/.test(text);
  const json = useMemo(() => (isJsonColumn || looksLikeJson) && !isNull ? parseJson(text) : null, [text, isJsonColumn, looksLikeJson, isNull]);

  const formatJson = (indent: number | undefined) => {
    if (json?.ok) {
      setText(JSON.stringify(json.value, null, indent));
    }
  };

  const changed = isNull !== (props.value === null) || (!isNull && text !== initialText);
  const canSave = props.editable && !binary && changed && !(isJsonColumn && json && !json.ok);

  const buttons = [
    ...(props.editable && !binary ? [<Button key="save" size="small" colorVariant="success" label="Save" disabled={!canSave} onClick={() => props.onSave(isNull ? null : text)} />] : []),
    <Button key="close" size="small" label={props.editable && !binary ? 'Cancel' : 'Close'} onClick={props.onClose} />,
  ];

  return (
    <Popup isOpen={true} label={`${props.column.name}  ·  ${props.column.type || ''}`} onClickOk={props.onClose} buttons={buttons}>
      <div className="cmp-value-editor">
        <div className="value-editor-toolbar">
          {binary ? (
            <>
              <span className="value-editor-info">{formatBytes(binary.size)}{binary.truncated ? ` (first ${formatBytes(binary.hex.length / 2)} shown)` : ''}</span>
              <button type="button" className={binaryView === 'hex' ? 'active' : ''} onClick={() => setBinaryView('hex')}>Hex</button>
              <button type="button" className={binaryView === 'text' ? 'active' : ''} disabled={binary.text === null} onClick={() => setBinaryView('text')}>Text</button>
            </>
          ) : (
            <>
              <span className="value-editor-info">{isNull ? 'NULL' : `${text.length.toLocaleString()} characters`}</span>
              {json && (
                <>
                  <button type="button" disabled={!json.ok} onClick={() => formatJson(2)}>Format JSON</button>
                  <button type="button" disabled={!json.ok} onClick={() => formatJson(undefined)}>Minify</button>
                  {!json.ok && <span className="value-editor-error" title={json.error}>Invalid JSON</span>}
                </>
              )}
              <label className="value-editor-check"><input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />Wrap</label>
              {props.editable && props.column.nullable && (
                <label className="value-editor-check"><input type="checkbox" checked={isNull} onChange={(e) => setIsNull(e.target.checked)} />NULL</label>
              )}
            </>
          )}
        </div>
        {binary ? (
          <pre className="value-editor-text binary">{binaryView === 'hex' ? hexDump(binary.hex) : binary.text}</pre>
        ) : (
          <textarea
            className={`value-editor-text ${wrap ? 'wrap' : ''}`}
            value={isNull ? '' : text}
            placeholder={isNull ? 'NULL' : ''}
            disabled={isNull}
            readOnly={!props.editable}
            spellCheck={false}
            autoFocus
            onChange={(e) => setText(e.target.value)}
          />
        )}
        {!props.editable && !binary && <div className="value-editor-hint">Read only</div>}
      </div>
    </Popup>
  );
}
