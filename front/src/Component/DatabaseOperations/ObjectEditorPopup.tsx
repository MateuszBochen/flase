import React, {useEffect, useRef, useState} from 'react';
import Popup from '../../UI/Popup/Popup';
import Button from '../../UI/Button/Button';
import Editor from '../../UI/Editor/Editor';
import EventBus from '../../Library/EventBus/EventBus';
import WebsocketReceivedAMessage from '../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../Library/WebSocket/Interface/MessageInterface';
import MessageType from '../../Library/WebSocket/Enum/MessageType';
import ConnectionDataInterface from '../../Library/Connection/Interface/ConnectionDataInterface';
import DriverFactory from '../../Library/Database/Driver/DriverFactory';
import DatabaseOperations from '../../Library/Database/DatabaseOperations';
import {ObjectDdlInterface, ObjectRefInterface} from '../../Library/Database/Interface/DatabaseObjectsInterface';
import {DatabaseOperationType} from '../../Library/Database/Interface/DatabaseOperationInterface';
import objectTemplate, {OBJECT_LABELS, ObjectTypeType} from './objectTemplates';
import {formatViewDdl} from '../../Library/Console/SqlFormatter';
import './style.css';

interface ObjectEditorPopupPropsInterface {
  connection: ConnectionDataInterface;
  database: string;
  /** edited object - its DDL is loaded; null for new object of `type` */
  object: ObjectRefInterface | null;
  type: ObjectTypeType;
  /** table used in templates of trigger and view */
  table?: string;
  tabId: string;
  busy: boolean;
  onPreview: (operation: DatabaseOperationType) => void;
  onCancel: () => void;
}

/** ObjectEditorPopup - CREATE statement of procedure, function, trigger, event or view in SQL editor */
export default (props: ObjectEditorPopupPropsInterface) => {
  const driver = DriverFactory.getDriver(props.connection);
  const [text, setText] = useState<string | null>(props.object ? null : objectTemplate(props.type, driver.dialect, props.table));
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<any>(null);
  const ddlTabId = `${props.tabId}:ddl`;
  const label = OBJECT_LABELS[props.type];

  // definition of edited object
  useEffect(() => {
    if (!props.object) return;
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.payload?.tabId !== ddlTabId) return;
      if (message.message === MessageType.OBJECT_DDL) {
        // view of MySQL / MariaDB comes in one line
        setText(formatViewDdl((message.payload as ObjectDdlInterface).ddl, driver.dialect));
      } else if (message.message === MessageType.QUERY_ERROR) {
        setError(message.payload.error);
      }
    });
    DatabaseOperations.objectDdl(props.connection, props.database, props.object, ddlTabId);
    return () => EventBus.unSub(eventId);
  }, [props.object, props.database, ddlTabId]);

  const preview = () => {
    const sql = editorRef.current?.getValue() ?? text ?? '';
    props.onPreview({kind: 'objectDdl', database: props.database, sql, replace: props.object});
  };

  return (
    <Popup
      openOnMount
      label={props.object ? `Edit ${label} ${props.object.name}` : `New ${label} in ${props.database}`}
      onClickOk={preview}
      onClose={props.onCancel}
      buttons={[
        <Button key="preview" size="small" colorVariant="success" label="Preview SQL" onClick={preview} loading={props.busy} disabled={text === null} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onCancel} />,
      ]}
    >
      <div className="cmp-object-editor">
        {error && <div className="object-editor-error">{error}</div>}
        {text === null && !error && <div className="structure-hint">Loading definition…</div>}
        {text !== null && (
          <div className="object-editor-code">
            <Editor
              defaultText={text}
              syntax="sql"
              customKeyWords={driver.keywords}
              onEditorMount={(editor) => {
                editorRef.current = editor;
                editor.focus();
              }}
            />
          </div>
        )}
        <div className="structure-hint">
          {driver.dialect === 'mysql'
            ? 'Write one CREATE statement without DELIMITER - semicolons inside BEGIN … END are fine.'
            : 'Write one CREATE statement, body of function in $$ … $$.'}
          {props.object && (driver.dialect === 'mysql'
            ? ' Object is dropped and created again; when CREATE fails, the previous definition is restored.'
            : ' CREATE OR REPLACE keeps dependent objects; other statements drop the object first (in one transaction).')}
        </div>
      </div>
    </Popup>
  );
}
