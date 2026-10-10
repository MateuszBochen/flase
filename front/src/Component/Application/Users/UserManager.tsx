import React, {useCallback, useEffect, useRef, useState} from 'react';
import toast from 'react-hot-toast';
import ApplicationInterface from '../ApplicationInterface';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import EventBus from '../../../Library/EventBus/EventBus';
import WebsocketReceivedAMessage from '../../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../../Library/WebSocket/Interface/MessageInterface';
import MessageType from '../../../Library/WebSocket/Enum/MessageType';
import UsersApi from '../../../Library/Users/UsersApi';
import {DbUserInterface, PrivilegeLevelInterface, UserChangeType, UserGrantInterface} from '../../../Library/Users/UserInterface';
import useConnectionSettings from '../../../Library/Connection/useConnectionSettings';
import Popup from '../../../UI/Popup/Popup';
import Button from '../../../UI/Button/Button';
import GrantForm from './GrantForm';
import './style.css';

export interface UserManagerPropsInterface extends ApplicationInterface {
  connection: ConnectionDataInterface;
}

type UserRefType = {name: string, host: string | null};
type FormType = {type: 'create'} | {type: 'password'} | {type: 'grant'} | null;

const sameUser = (a: UserRefType | null, b: UserRefType | null) => !!a && !!b && a.name === b.name && a.host === b.host;
const accountName = (user: UserRefType) => user.host === null ? user.name : `${user.name}@${user.host}`;

/** UserManager - accounts of server, their grants; every change is previewed as SQL */
export default (props: UserManagerPropsInterface) => {
  const connection = useConnectionSettings(props.connection);
  const tabId = `${props.tabId}:users`;
  const isPostgres = /^(postgres|postgresql|pgsql):/i.test(connection.dsn);
  const [users, setUsers] = useState<DbUserInterface[]>([]);
  const [levels, setLevels] = useState<PrivilegeLevelInterface[]>([]);
  const [selected, setSelected] = useState<UserRefType | null>(null);
  const [grants, setGrants] = useState<UserGrantInterface[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const [form, setForm] = useState<FormType>(null);
  const [preview, setPreview] = useState<{statements: string[], change: UserChangeType, user: UserRefType | null} | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  /** change waiting for answer */
  const pending = useRef<{change: UserChangeType, user: UserRefType | null} | null>(null);
  const selectedRef = useRef<UserRefType | null>(null);
  selectedRef.current = selected;

  const reload = useCallback(() => UsersApi.loadUsers(connection, tabId), [connection, tabId]);

  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.payload?.tabId !== tabId) return;
      switch (message.message) {
        case MessageType.USERS:
          setUsers(message.payload.users);
          setLevels(message.payload.privilegeLevels);
          setError(null);
          break;
        case MessageType.USER_GRANTS:
          if (sameUser(message.payload.user, selectedRef.current)) {
            setGrants(message.payload.grants);
          }
          break;
        case MessageType.USER_CHANGE_PREVIEW:
          setBusy(false);
          setPreview({statements: message.payload.statements, ...pending.current!});
          break;
        case MessageType.USER_CHANGE_APPLIED: {
          setBusy(false);
          setPreview(null);
          setForm(null);
          const applied = pending.current;
          pending.current = null;
          toast.success('Done');
          reload();
          if (applied?.change.kind === 'drop') {
            setSelected(null);
            setGrants(null);
          } else if (applied?.change.kind === 'create') {
            setSelected({name: applied.change.name.trim(), host: isPostgres ? null : (applied.change.host?.trim() || '%')});
          } else if (selectedRef.current) {
            UsersApi.loadGrants(connection, tabId, selectedRef.current);
          }
          break;
        }
        case MessageType.QUERY_ERROR:
          setBusy(false);
          pending.current = null;
          // list itself failed - e.g. missing privilege to read mysql.user
          if (message.payload.command === 'GET_USERS') {
            setError(message.payload.error);
          }
          break;
      }
    });
    reload();
    return () => EventBus.unSub(eventId);
  }, [tabId]);

  useEffect(() => {
    setGrants(null);
    if (selected) {
      UsersApi.loadGrants(connection, tabId, selected);
    }
  }, [selected?.name, selected?.host]);

  const requestPreview = (change: UserChangeType, user: UserRefType | null = selected) => {
    pending.current = {change, user};
    setBusy(true);
    UsersApi.change(connection, tabId, user, change, true);
  };

  const execute = () => {
    if (!preview) return;
    pending.current = {change: preview.change, user: preview.user};
    setBusy(true);
    UsersApi.change(connection, tabId, preview.user, preview.change, false);
  };

  const destructive = preview?.change.kind === 'drop' || preview?.change.kind === 'revoke';
  const selectedUser = users.find((user) => sameUser(user, selected));
  const shown = users.filter((user) => !filter || accountName(user).toLowerCase().includes(filter.toLowerCase()));
  const label = isPostgres ? 'role' : 'user';

  return (
    <div className="cmp-user-manager">
      <div className="users-list">
        <div className="users-toolbar">
          <input placeholder={`Filter ${label}s`} value={filter} onChange={(e) => setFilter(e.target.value)} />
          <button type="button" disabled={connection.readOnly} onClick={() => setForm({type: 'create'})}>+ New {label}</button>
          <button type="button" title="Reload" onClick={reload}>⟳</button>
        </div>
        {error && <div className="users-error">{error}</div>}
        <ul>
          {shown.map((user) => (
            <li
              key={accountName(user)}
              className={sameUser(user, selected) ? 'active' : ''}
              onClick={() => setSelected({name: user.name, host: user.host})}
            >
              <span className="user-name">{user.name}</span>
              {user.host !== null && <span className="user-host">@{user.host}</span>}
              {user.attributes.includes('superuser') && <span className="user-badge">super</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="user-detail">
        {!selectedUser && <div className="users-hint">Select {label} on the left.</div>}
        {selectedUser && (
          <>
            <div className="user-title">
              {accountName(selectedUser)}
              <div className="user-actions">
                <button type="button" disabled={connection.readOnly} onClick={() => setForm({type: 'grant'})}>Grant…</button>
                <button type="button" disabled={connection.readOnly} onClick={() => setForm({type: 'password'})}>Change password…</button>
                <button type="button" className="danger" disabled={connection.readOnly} onClick={() => requestPreview({kind: 'drop'})}>Drop {label}…</button>
              </div>
            </div>
            <div className="user-attributes">
              {selectedUser.attributes.map((attribute) => <span key={attribute}>{attribute}</span>)}
            </div>
            <h4>Privileges</h4>
            {grants === null && <div className="users-hint">Loading…</div>}
            {grants !== null && !grants.length && <div className="users-hint">No privileges.</div>}
            {grants?.map((grant) => (
              <div className="user-grant" key={grant.grant}>
                <code>{grant.grant}</code>
                {grant.revoke && (
                  <button type="button" disabled={connection.readOnly} onClick={() => requestPreview({kind: 'revoke', grant: grant.grant})}>Revoke…</button>
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {form?.type === 'create' && (
        <CreateUserForm isPostgres={isPostgres} busy={busy} onCancel={() => setForm(null)}
          onPreview={(name, host, password) => requestPreview({kind: 'create', name, host: isPostgres ? null : host, password}, null)} />
      )}
      {form?.type === 'password' && selected && (
        <PasswordForm title={`Password of ${accountName(selected)}`} busy={busy} onCancel={() => setForm(null)}
          onPreview={(password) => requestPreview({kind: 'password', password})} />
      )}
      {form?.type === 'grant' && selected && (
        <GrantForm connection={connection} levels={levels} roles={users.map((user) => user.name).filter((name) => name !== selected.name)}
          busy={busy} onCancel={() => setForm(null)} onPreview={(change) => requestPreview(change)} />
      )}
      {preview && (
        <Popup
          isOpen={true}
          label={destructive ? 'Confirm - this cannot be undone' : 'Confirm change'}
          onClickOk={() => setPreview(null)}
          buttons={[
            <Button key="execute" size="small" colorVariant={destructive ? 'danger' : 'success'} label={destructive ? 'Hold to execute' : 'Execute'} loading={busy} onClick={execute} />,
            <Button key="close" size="small" label="Cancel" onClick={() => setPreview(null)} />,
          ]}
        >
          <pre className="cmp-sql-preview">{preview.statements.map((statement) => `${statement};`).join('\n')}</pre>
        </Popup>
      )}
    </div>
  );
}

const CreateUserForm = (props: {isPostgres: boolean, busy: boolean, onCancel: () => void, onPreview: (name: string, host: string, password: string) => void}) => {
  const [name, setName] = useState<string>('');
  const [host, setHost] = useState<string>('%');
  const [password, setPassword] = useState<string>('');
  const preview = () => props.onPreview(name, host, password);
  return (
    <Popup
      isOpen={true}
      label={props.isPostgres ? 'New role' : 'New user'}
      onClickOk={preview}
      buttons={[
        <Button key="preview" size="small" colorVariant="success" label="Preview SQL" loading={props.busy} disabled={!name.trim() || !password} onClick={preview} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onCancel} />,
      ]}
    >
      <div className="cmp-structure-form">
        <label>Name<input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        {!props.isPostgres && <label>Host<input value={host} onChange={(e) => setHost(e.target.value)} placeholder="% = any host" /></label>}
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></label>
        {props.isPostgres && <div className="hint">Role is created with LOGIN.</div>}
      </div>
    </Popup>
  );
};

const PasswordForm = (props: {title: string, busy: boolean, onCancel: () => void, onPreview: (password: string) => void}) => {
  const [password, setPassword] = useState<string>('');
  const [repeat, setRepeat] = useState<string>('');
  const preview = () => props.onPreview(password);
  return (
    <Popup
      isOpen={true}
      label={props.title}
      onClickOk={preview}
      buttons={[
        <Button key="preview" size="small" colorVariant="success" label="Preview SQL" loading={props.busy} disabled={!password || password !== repeat} onClick={preview} />,
        <Button key="cancel" size="small" label="Cancel" onClick={props.onCancel} />,
      ]}
    >
      <div className="cmp-structure-form">
        <label>New password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="new-password" /></label>
        <label>Repeat<input type="password" value={repeat} onChange={(e) => setRepeat(e.target.value)} autoComplete="new-password" /></label>
        {repeat && password !== repeat && <div className="hint">Passwords differ.</div>}
      </div>
    </Popup>
  );
};
