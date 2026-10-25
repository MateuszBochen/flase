import React, {useEffect, useMemo, useRef, useState} from 'react';
import Popup from '../../../UI/Popup/Popup';
import Button from '../../../UI/Button/Button';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {CellValueType} from '../Interface/RecordsViewPropsInterface';
import {
  BinaryValueInterface,
  binaryOfBytes,
  binaryOfText,
  formatBytes,
  hexDump,
  hexForEditing,
  isBinaryColumn,
  isBinaryValue,
  isLongText,
  isSameBinary,
  MAX_BINARY_WRITE_BYTES,
  parseHexInput,
} from '../../../Library/Record/BinaryValue';
import {hexOfUuidInput, isBinary16, isUuidColumn, uuidOfHex} from '../../../Library/Record/Uuid';

export type EditedValueType = CellValueType | BinaryValueInterface;

interface ValueEditorPropsInterface {
  column: ColumnInterface;
  value: EditedValueType | undefined;
  /** binary value as file */
  onDownload?: () => void;
  /** value can be changed - otherwise only shown */
  editable: boolean;
  /** grid shows column as UUID (recognized by all its values or chosen by user) */
  asUuid?: boolean;
  /** whole long text (grid has only its beginning), null when row cannot be identified */
  loadText?: () => Promise<string> | null;
  onSave: (value: EditedValueType) => void;
  onClose: () => void;
}

const parseJson = (text: string): {ok: boolean, value?: any, error?: string} => {
  try {
    return {ok: true, value: JSON.parse(text)};
  } catch (e: any) {
    return {ok: false, error: e?.message || String(e)};
  }
};

type BinaryViewType = 'hex' | 'text' | 'uuid';

/** longer values are not edited as text of textarea (megabytes of hex) - they can be replaced by file */
const MAX_TYPED_BINARY_BYTES = 64 * 1024;

const EMPTY_BINARY = binaryOfBytes(new Uint8Array(0));

const inputOf = (value: BinaryValueInterface, view: BinaryViewType): string => {
  if (view === 'uuid') return isBinary16(value) ? uuidOfHex(value.hex) : '';
  if (view === 'text') return value.text ?? '';
  return hexForEditing(value.hex);
};

/** typed text as bytes of view, error when it cannot be converted */
const parseInput = (input: string, view: BinaryViewType): {value?: BinaryValueInterface, error?: string} => {
  if (view === 'text') {
    return {value: binaryOfText(input)};
  }
  const hex = view === 'uuid' ? hexOfUuidInput(input) : parseHexInput(input);
  if (hex === null) {
    return {error: view === 'uuid' ? 'Not valid UUID' : 'Not valid hex - pairs of 0-9 A-F'};
  }
  const bytes = new Uint8Array((hex.match(/../g) || []).map((byte) => parseInt(byte, 16)));
  return {value: binaryOfBytes(bytes)};
};

/** ValueEditor - long texts, JSON (format / minify) and binary values (hex / text / UUID / file) */
export default (props: ValueEditorPropsInterface) => {
  const original = isBinaryValue(props.value) ? props.value : null;
  // NULL of binary column is edited as bytes too
  const binaryMode = !!original || isBinaryColumn(props.column);
  /** long text - its beginning until whole value is loaded */
  const longText = isLongText(props.value) ? props.value : null;
  const [loadedText, setLoadedText] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const loadingText = !!longText && loadedText === null;
  const initialText = binaryMode || props.value === null || props.value === undefined ? ''
    : longText ? (loadedText ?? longText.text) : String(props.value);
  // preview is only shown, value can be changed when it is whole
  const editable = props.editable && !loadingText;

  const [text, setText] = useState<string>(initialText);

  useEffect(() => {
    if (!longText) return;
    const loading = props.loadText?.();
    if (!loading) {
      setLoadError('Row cannot be identified (no primary key) - only beginning of value is shown');
      return;
    }
    let active = true;
    loading.then((whole) => {
      if (!active) return;
      setLoadedText(whole);
      setText(whole);
    }).catch((e) => active && setLoadError(e?.message || 'Value could not be loaded'));
    return () => {
      active = false;
    };
  }, []);
  const [isNull, setIsNull] = useState<boolean>(props.value === null);
  const [wrap, setWrap] = useState<boolean>(true);

  // binary - current bytes (original until changed), view and its text
  const [binary, setBinary] = useState<BinaryValueInterface>(original || EMPTY_BINARY);
  const [binaryView, setBinaryView] = useState<BinaryViewType>(
    (props.asUuid || isUuidColumn(props.column, [props.value])) && isBinary16(props.value) ? 'uuid' : original?.text !== null && original?.text !== undefined ? 'text' : 'hex',
  );
  const [binaryInput, setBinaryInput] = useState<string>(() => inputOf(binary, binaryView));
  const [binaryError, setBinaryError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const isJsonColumn = /^json/i.test(props.column.type || '');
  const looksLikeJson = /^\s*[[{]/.test(text);
  const json = useMemo(() => !binaryMode && !loadingText && (isJsonColumn || looksLikeJson) && !isNull ? parseJson(text) : null, [binaryMode, loadingText, text, isJsonColumn, looksLikeJson, isNull]);

  const formatJson = (indent: number | undefined) => {
    if (json?.ok) {
      setText(JSON.stringify(json.value, null, indent));
    }
  };

  // preview of long value (only its beginning is in grid) and big files are not typed - only replaced
  const canType = editable && !isNull && !binary.truncated && binary.size <= MAX_TYPED_BINARY_BYTES;
  const showBinaryView = (view: BinaryViewType) => {
    setBinaryView(view);
    setBinaryInput(inputOf(binary, view));
    setBinaryError(null);
  };
  const onBinaryInput = (input: string) => {
    setBinaryInput(input);
    const parsed = parseInput(input, binaryView);
    setBinaryError(parsed.error ?? null);
    if (parsed.value) {
      setBinary(parsed.value);
      setFileName(null);
    }
  };
  const onFile = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BINARY_WRITE_BYTES) {
      setBinaryError(`File is larger than ${formatBytes(MAX_BINARY_WRITE_BYTES)}`);
      return;
    }
    file.arrayBuffer().then((buffer) => {
      const value = binaryOfBytes(new Uint8Array(buffer));
      const view: BinaryViewType = binaryView === 'uuid' && isBinary16(value) ? 'uuid' : value.text !== null ? 'text' : 'hex';
      setBinary(value);
      setIsNull(false);
      setFileName(file.name);
      setBinaryView(view);
      setBinaryInput(inputOf(value, view));
      setBinaryError(null);
    }).catch(() => setBinaryError('File could not be read'));
  };

  const binaryChanged = isNull ? props.value !== null : !original || !isSameBinary(original, binary);
  const changed = binaryMode
    ? binaryChanged
    : isNull !== (props.value === null) || (!isNull && text !== initialText);
  const canSave = editable && changed
    && (binaryMode ? !binaryError : !(isJsonColumn && json && !json.ok));
  const save = () => props.onSave(isNull ? null : binaryMode ? binary : text);

  const buttons = [
    ...(original && props.onDownload && !binaryChanged ? [<Button key="download" size="small" label="Download" onClick={props.onDownload} />] : []),
    ...(editable ? [<Button key="save" size="small" colorVariant="success" label="Save" disabled={!canSave} onClick={save} />] : []),
    <Button key="close" size="small" label={editable ? 'Cancel' : 'Close'} onClick={props.onClose} />,
  ];

  const nullCheck = editable && props.column.nullable && (
    <label className="value-editor-check"><input type="checkbox" checked={isNull} onChange={(e) => setIsNull(e.target.checked)} />NULL</label>
  );

  const binaryInfo = isNull
    ? 'NULL'
    : `${formatBytes(binary.size)}${binary.truncated ? ` (first ${formatBytes(binary.hex.length / 2)} shown)` : ''}${fileName ? ` · ${fileName}` : ''}`;

  return (
    <Popup openOnMount label={`${props.column.name}  ·  ${props.column.type || ''}`} onClickOk={props.onClose} onClose={props.onClose} buttons={buttons}>
      <div className="cmp-value-editor">
        <div className="value-editor-toolbar">
          {binaryMode ? (
            <>
              <span className="value-editor-info">{binaryInfo}</span>
              {binaryError && <span className="value-editor-error">{binaryError}</span>}
              <button type="button" className={binaryView === 'hex' ? 'active' : ''} disabled={isNull} onClick={() => showBinaryView('hex')}>Hex</button>
              <button type="button" className={binaryView === 'text' ? 'active' : ''} disabled={isNull || (binary.text === null && !(canType && binary.size === 0))} onClick={() => showBinaryView('text')}>Text</button>
              {(isBinary16(binary) || binaryView === 'uuid') && (
                <button type="button" className={binaryView === 'uuid' ? 'active' : ''} disabled={isNull} onClick={() => showBinaryView('uuid')}>UUID</button>
              )}
              {editable && (
                <>
                  <button type="button" onClick={() => fileInput.current?.click()}>Upload file…</button>
                  <input
                    ref={fileInput}
                    type="file"
                    hidden
                    aria-label="Upload file"
                    onChange={(e) => {
                      onFile(e.target.files?.[0]);
                      e.target.value = '';
                    }}
                  />
                </>
              )}
              {nullCheck}
            </>
          ) : (
            <>
              <span className="value-editor-info">
                {isNull ? 'NULL' : loadingText
                  ? `${longText!.length.toLocaleString()} characters - ${loadError ? `first ${longText!.text.length.toLocaleString()} shown` : 'loading…'}`
                  : `${text.length.toLocaleString()} characters`}
              </span>
              {loadError && <span className="value-editor-error">{loadError}</span>}
              {json && (
                <>
                  <button type="button" disabled={!json.ok} onClick={() => formatJson(2)}>Format JSON</button>
                  <button type="button" disabled={!json.ok} onClick={() => formatJson(undefined)}>Minify</button>
                  {!json.ok && <span className="value-editor-error" title={json.error}>Invalid JSON</span>}
                </>
              )}
              <label className="value-editor-check"><input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} />Wrap</label>
              {nullCheck}
            </>
          )}
        </div>
        {binaryMode ? (
          canType || isNull ? (
            <textarea
              className={`value-editor-text binary ${binaryView === 'text' ? 'wrap' : ''}`}
              value={isNull ? '' : binaryInput}
              placeholder={isNull ? 'NULL' : binaryView === 'hex' ? 'hex, e.g. 0A FF 3C' : ''}
              disabled={isNull}
              spellCheck={false}
              autoFocus
              aria-label="Binary value"
              onChange={(e) => onBinaryInput(e.target.value)}
            />
          ) : (
            <pre className="value-editor-text binary">{binaryView === 'uuid' && isBinary16(binary) ? uuidOfHex(binary.hex) : binaryView === 'text' && binary.text !== null ? binary.text : hexDump(binary.hex.slice(0, 8192))}</pre>
          )
        ) : (
          <textarea
            className={`value-editor-text ${wrap ? 'wrap' : ''}`}
            value={isNull ? '' : text}
            placeholder={isNull ? 'NULL' : ''}
            disabled={isNull}
            readOnly={!editable}
            spellCheck={false}
            autoFocus
            onChange={(e) => setText(e.target.value)}
          />
        )}
        {editable && binaryMode && !isNull && !canType && (
          <div className="value-editor-hint">
            {binary.truncated
              ? 'Grid has only beginning of this value - it can be replaced by file or set to NULL'
              : `Value is longer than ${formatBytes(MAX_TYPED_BINARY_BYTES)} - it can be replaced by file`}
          </div>
        )}
        {!editable && (
          <div className="value-editor-hint">
            {props.editable && loadingText ? (loadError ? 'Only beginning of value is shown - it cannot be changed here' : 'Loading whole value…') : 'Read only'}
          </div>
        )}
      </div>
    </Popup>
  );
}
