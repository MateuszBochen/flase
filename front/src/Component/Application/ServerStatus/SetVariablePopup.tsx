import React, {useEffect, useRef, useState} from 'react';
import toast from 'react-hot-toast';
import Popup from '../../../UI/Popup/Popup';
import Button from '../../../UI/Button/Button';
import EventBus from '../../../Library/EventBus/EventBus';
import WebsocketReceivedAMessage from '../../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../../Library/WebSocket/Interface/MessageInterface';
import MessageType from '../../../Library/WebSocket/Enum/MessageType';
import CommandType from '../../../Library/WebSocket/Enum/CommandType';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import {sendServerCommand} from '../../../Library/Server/useServerRequest';
import {ServerVariableInterface, ServerVariablesInterface, SetVariableResultInterface} from '../../../Library/Server/ServerInterface';
import '../TableRecords/Structure/style.css';

interface SetVariablePopupPropsInterface {
  connection: ConnectionDataInterface;
  variable: ServerVariableInterface;
  variables: ServerVariablesInterface;
  tabId: string;
  onApplied: () => void;
  onCancel: () => void;
}

type RequestType = {value: string | null, persist: boolean};

/** SetVariablePopup - new value of server variable, sql is previewed before execution */
export default (props: SetVariablePopupPropsInterface) => {
  const variable = props.variable;
  const [value, setValue] = useState<string>(variable.display ?? variable.value);
  const [persist, setPersist] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [preview, setPreview] = useState<string[] | null>(null);
  /** request waiting for answer */
  const pending = useRef<RequestType | null>(null);
  const previewed = useRef<RequestType | null>(null);
  const onAppliedRef = useRef(props.onApplied);
  onAppliedRef.current = props.onApplied;

  const send = (request: RequestType, dryRun: boolean) => {
    pending.current = request;
    setBusy(true);
    sendServerCommand(props.connection, CommandType.SET_SERVER_VARIABLE, {tabId: props.tabId, name: variable.name, value: request.value, persist: request.persist, dryRun});
  };

  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.payload?.tabId !== props.tabId) return;
      switch (message.message) {
        case MessageType.SERVER_VARIABLE_PREVIEW:
          setBusy(false);
          previewed.current = pending.current;
          setPreview((message.payload as SetVariableResultInterface).statements);
          break;
        case MessageType.SERVER_VARIABLE_APPLIED:
          setBusy(false);
          setPreview(null);
          toast.success(variable.needsRestart ? `${variable.name} was changed - it is used after restart` : `${variable.name} was changed`);
          onAppliedRef.current();
          break;
        case MessageType.QUERY_ERROR:
          setBusy(false);
          break;
      }
    });
    return () => EventBus.unSub(eventId);
  }, [props.tabId]);

  const options = variable.options;

  return (
    <>
      <Popup
        isOpen={true}
        label={`Change ${variable.name}`}
        onClickOk={() => send({value, persist}, true)}
        buttons={[
          <Button key="preview" size="small" colorVariant="success" label="Preview SQL" loading={busy} onClick={() => send({value, persist}, true)} />,
          <Button key="default" size="small" label="Reset to default" disabled={busy} onClick={() => send({value: null, persist}, true)} />,
          <Button key="cancel" size="small" label="Cancel" onClick={props.onCancel} />,
        ]}
      >
        <form className="cmp-structure-form" onSubmit={(event) => { event.preventDefault(); send({value, persist}, true); }}>
          <label>
            Value
            {options?.length ? (
              <select value={options.includes(value) ? value : options.find((item) => item.toLowerCase() === value.toLowerCase()) || value} onChange={(event) => setValue(event.target.value)} aria-label="Value" autoFocus>
                {!options.some((item) => item.toLowerCase() === value.toLowerCase()) && <option value={value}>{value}</option>}
                {options.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            ) : (
              <input value={value} onChange={(event) => setValue(event.target.value)} aria-label="Value" autoFocus />
            )}
          </label>
          <div className="hint">
            Current: <strong>{variable.display ?? variable.value}</strong>{variable.unit ? ` (unit ${variable.unit})` : ''}
            {variable.defaultValue !== null && <> · default: {variable.defaultValue}</>}
          </div>
          {variable.description && <div className="hint">{variable.description}</div>}
          {props.variables.supportsPersist && (
            <label className="checkbox">
              <input type="checkbox" checked={persist} onChange={(event) => setPersist(event.target.checked)} />
              Keep after restart (SET PERSIST)
            </label>
          )}
          <div className="hint">
            {props.variables.persistentChanges
              ? 'ALTER SYSTEM writes postgresql.auto.conf - the value is kept after restart, configuration is reloaded.'
              : props.variables.supportsPersist
                ? 'SET GLOBAL changes the running server only; with SET PERSIST the value is kept after restart.'
                : 'SET GLOBAL changes the running server only - change the configuration file to keep the value after restart.'}
            {variable.needsRestart && ' This setting is used after restart of the server.'}
            {variable.editable === null && ' Some variables cannot be changed while server runs - the server reports it.'}
          </div>
          <button type="submit" hidden />
        </form>
      </Popup>
      {preview && (
        <Popup
          isOpen={true}
          label={`Confirm change of ${variable.name}`}
          onClickOk={() => setPreview(null)}
          buttons={[
            <Button key="execute" size="small" colorVariant="success" label="Execute" loading={busy} onClick={() => previewed.current && send(previewed.current, false)} />,
            <Button key="cancel" size="small" label="Cancel" onClick={() => setPreview(null)} />,
          ]}
        >
          <pre className="cmp-sql-preview">{preview.map((statement) => `${statement};`).join('\n')}</pre>
        </Popup>
      )}
    </>
  );
}
