import React, {useEffect, useRef, useState} from 'react';
import toast from 'react-hot-toast';
import Popup from '../../../../UI/Popup/Popup';
import Button from '../../../../UI/Button/Button';
import EventBus from '../../../../Library/EventBus/EventBus';
import WebsocketReceivedAMessage from '../../../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../../../Library/WebSocket/Interface/MessageInterface';
import MessageType from '../../../../Library/WebSocket/Enum/MessageType';
import CommandType from '../../../../Library/WebSocket/Enum/CommandType';
import ConnectionDataInterface from '../../../../Library/Connection/Interface/ConnectionDataInterface';
import DriverFactory from '../../../../Library/Database/Driver/DriverFactory';
import {sendServerCommand} from '../../../../Library/Server/useServerRequest';
import ColumnInterface from '../../../../Library/Table/Interface/ColumnInterface';
import TableInterface from '../../../../Library/Table/Interface/TableInterface';
import {FindReplaceResultInterface} from '../../../../Library/CellTools/CellToolsInterface';
import '../Structure/style.css';

interface FindReplacePopupPropsInterface {
  connection: ConnectionDataInterface;
  table: TableInterface;
  columns: ColumnInterface[];
  tabId: string;
  readOnly: boolean;
  onApplied: () => void;
  onClose: () => void;
}

const TEXT_TYPE = /char|text|citext|^name\b/i;

/** text with parts of difference marked - same prefix and suffix are left plain */
const Difference = (props: {before: string | null, after: string | null}) => {
  const before = props.before ?? '';
  const after = props.after ?? '';
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  const part = (text: string) => <>{text.slice(0, start)}<mark>{text.slice(start, text.length - end)}</mark>{text.slice(text.length - end)}</>;
  return (
    <>
      <td className="find-before">{part(before)}</td>
      <td className="find-after">{part(after)}</td>
    </>
  );
};

/** FindReplacePopup - replace of text in one column of whole table, changed rows are counted and shown before execution */
export default (props: FindReplacePopupPropsInterface) => {
  const driver = DriverFactory.getDriver(props.connection);
  const textColumns = props.columns.filter((column) => TEXT_TYPE.test(column.type || '') && !/binary|blob/i.test(column.type || ''));
  const [column, setColumn] = useState<string>(textColumns[0]?.name || '');
  const [find, setFind] = useState<string>('');
  const [replace, setReplace] = useState<string>('');
  const [regex, setRegex] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [preview, setPreview] = useState<FindReplaceResultInterface | null>(null);
  const onAppliedRef = useRef(props.onApplied);
  onAppliedRef.current = props.onApplied;

  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.payload?.tabId !== props.tabId) return;
      switch (message.message) {
        case MessageType.FIND_REPLACE_PREVIEW:
          setBusy(false);
          setPreview(message.payload as FindReplaceResultInterface);
          break;
        case MessageType.FIND_REPLACE_APPLIED:
          setBusy(false);
          setPreview(null);
          toast.success(`Replaced in ${message.payload.affected} row(s)`);
          onAppliedRef.current();
          break;
        case MessageType.QUERY_ERROR:
          setBusy(false);
          break;
      }
    });
    return () => EventBus.unSub(eventId);
  }, [props.tabId]);

  const send = (dryRun: boolean) => {
    setBusy(true);
    sendServerCommand(props.connection, CommandType.FIND_REPLACE, {tabId: props.tabId, table: props.table, column, find, replace, regex, dryRun});
  };
  // options changed - shown preview is not valid
  const changed = (setter: (value: any) => void) => (value: any) => {
    setter(value);
    setPreview(null);
  };

  return (
    <Popup
      openOnMount
      label={`Find and replace in ${props.table.name}`}
      onClickOk={props.onClose}
      onClose={props.onClose}
      buttons={[
        <Button key="preview" size="small" colorVariant="success" label="Preview" loading={busy && !preview} disabled={!column || !find} onClick={() => send(true)} />,
        <Button
          key="replace"
          size="small"
          colorVariant="danger"
          label={preview ? `Hold to replace in ${preview.count} row(s)` : 'Replace'}
          loading={busy && !!preview}
          disabled={!preview || !preview.count || props.readOnly}
          onClick={() => send(false)}
        />,
        <Button key="close" size="small" label="Close" onClick={props.onClose} />,
      ]}
    >
      <form className="cmp-structure-form cmp-find-replace" onSubmit={(event) => { event.preventDefault(); if (column && find) send(true); }}>
        <label>
          Column
          <select value={column} onChange={(event) => changed(setColumn)(event.target.value)} aria-label="Column" autoFocus>
            {textColumns.map((item) => <option key={item.name} value={item.name}>{item.name} ({item.type})</option>)}
          </select>
        </label>
        <label>Find<input value={find} onChange={(event) => changed(setFind)(event.target.value)} aria-label="Find" /></label>
        <label>Replace with<input value={replace} onChange={(event) => changed(setReplace)(event.target.value)} aria-label="Replace with" /></label>
        <label className="checkbox">
          <input type="checkbox" checked={regex} onChange={(event) => changed(setRegex)(event.target.checked)} />
          Regular expression
        </label>
        <div className="hint">
          {regex
            ? driver.dialect === 'mysql'
              ? 'REGEXP_REPLACE - all matches; groups in replacement: $1 (MySQL), \\1 (MariaDB).'
              : 'regexp_replace with flag g - all matches; groups in replacement: \\1.'
            : 'Text is found with exact letter case. Whole table is changed, not only shown rows.'}
        </div>
        {!textColumns.length && <div className="structure-error">Table has no text column.</div>}
        <button type="submit" hidden />

        {preview && (
          <div className="find-preview">
            <div className="find-count">{preview.count ? <><strong>{preview.count.toLocaleString()}</strong> row(s) will change</> : 'No row contains the text.'}</div>
            {preview.rows.length > 0 && (
              <table>
                <thead><tr>{preview.keyColumns.map((key) => <th key={key}>{key}</th>)}<th>Before</th><th>After</th></tr></thead>
                <tbody>
                  {preview.rows.map((row, index) => (
                    <tr key={index}>
                      {row.key.map((value, keyIndex) => <td key={keyIndex} className="find-key">{value}</td>)}
                      <Difference before={row.before} after={row.after} />
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {preview.count > preview.rows.length && <div className="hint">First {preview.rows.length} rows are shown.</div>}
            <pre className="cmp-sql-preview">{preview.statement};</pre>
          </div>
        )}
      </form>
    </Popup>
  );
}
