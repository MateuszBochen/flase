import React, {FormEvent, useMemo, useState} from 'react';
import {v4 as uuidv4} from 'uuid';
import toast from 'react-hot-toast';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faCircleCheck, faCircleXmark, faDatabase, faLock, faPlug, faShieldHalved} from '@fortawesome/free-solid-svg-icons';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import ConnectionSettings from '../../../Library/Connection/ConnectionSettings';
import {CONNECTION_COLORS} from '../../../Library/Connection/ConnectionColors';
import LoginRequest from '../../../Library/API/Request/LoginRequest';
import DisconnectRequest from '../../../Library/API/Request/DisconnectRequest';
import EventBus from '../../../Library/EventBus/EventBus';
import ConnectionFormWasSubmitted from '../../ConnectionForm/Event/ConnectionFormWasSubmitted';
import './style.css';

type EngineType = 'mysql' | 'mariadb' | 'postgresql';
type ModeType = 'host' | 'dsn';
type TestStateType = {status: 'idle' | 'testing' | 'ok' | 'error', message?: string};

const ENGINES: {value: EngineType, label: string, port: string, hint: string}[] = [
  {value: 'mysql', label: 'MySQL', port: '3306', hint: '5.7, 8.x'},
  {value: 'mariadb', label: 'MariaDB', port: '3306', hint: '10.x, 11.x'},
  {value: 'postgresql', label: 'PostgreSQL', port: '5432', hint: '12 and newer'},
];

const DSN_PATTERN = /^(mysql|mariadb|postgresql|postgres|pgsql):\/\/([^/:?#\s]+)(?::(\d+))?(?:\/([^?#\s]*))?$/i;

/** postgres:// and pgsql:// are PostgreSQL */
const engineOf = (scheme: string): EngineType => {
  const lower = scheme.toLowerCase();
  return lower === 'mysql' || lower === 'mariadb' ? lower : 'postgresql';
};

const buildDsn = (engine: EngineType, host: string, port: string, database: string): string => {
  const defaultPort = ENGINES.find((item) => item.value === engine)!.port;
  return `${engine}://${host.trim() || 'localhost'}:${port.trim() || defaultPort}${database.trim() ? `/${database.trim()}` : ''}`;
};

/** NewDatabaseConnection - engine, address (host / port / database or DSN), user, color and safety options */
export default () => {
  const [engine, setEngine] = useState<EngineType>('mysql');
  const [mode, setMode] = useState<ModeType>('host');
  const [host, setHost] = useState<string>('localhost');
  const [port, setPort] = useState<string>('3306');
  const [database, setDatabase] = useState<string>('');
  const [dsnText, setDsnText] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [color, setColor] = useState<string>('');
  const [readOnly, setReadOnly] = useState<boolean>(false);
  const [confirm, setConfirm] = useState<boolean>(false);
  const [test, setTest] = useState<TestStateType>({status: 'idle'});
  const [submitted, setSubmitted] = useState<boolean>(false);

  const dsn = mode === 'host' ? buildDsn(engine, host, port, database) : dsnText.trim();
  const dsnValid = DSN_PATTERN.test(dsn);
  const parsed = DSN_PATTERN.exec(dsn);
  const suggestedName = parsed ? `${parsed[2]}${parsed[4] ? ` · ${parsed[4]}` : ''}` : '';
  const displayName = name.trim() || suggestedName;
  const nameTaken = useMemo(
    () => ConnectionSettings.getInstance().getConnections().some((item) => item.displayName === displayName),
    [displayName, submitted],
  );

  const errors = {
    dsn: !dsnValid ? (mode === 'dsn' && !dsnText.trim() ? 'DSN is required' : 'Expected e.g. mysql://host:3306 or postgresql://host:5432/database') : null,
    username: !username.trim() ? 'User is required' : null,
    name: !displayName ? 'Name is required' : nameTaken ? 'Connection with this name already exists' : null,
  };
  const valid = !errors.dsn && !errors.username && !errors.name;

  const changeEngine = (value: EngineType) => {
    const previousDefault = ENGINES.find((item) => item.value === engine)!.port;
    setEngine(value);
    // port typed by user stays
    if (!port.trim() || port === previousDefault) {
      setPort(ENGINES.find((item) => item.value === value)!.port);
    }
    setTest({status: 'idle'});
  };

  /** DSN typed / pasted - fields follow it, switch back to host mode keeps the values */
  const changeDsn = (value: string) => {
    setDsnText(value);
    setTest({status: 'idle'});
    const match = DSN_PATTERN.exec(value.trim());
    if (match) {
      setEngine(engineOf(match[1]));
      setHost(match[2]);
      setPort(match[3] || ENGINES.find((item) => item.value === engineOf(match[1]))!.port);
      setDatabase(match[4] || '');
    }
  };

  const changeMode = (value: ModeType) => {
    if (value === 'dsn' && !dsnText.trim()) {
      setDsnText(buildDsn(engine, host, port, database));
    }
    setMode(value);
  };

  const connectionData = (): ConnectionDataInterface => ({
    id: uuidv4(),
    displayName,
    dsn,
    username: username.trim(),
    color: color || undefined,
    readOnly,
    changeConfirmationRequired: confirm,
  });

  const testConnection = () => {
    setSubmitted(true);
    if (errors.dsn || errors.username) return;
    setTest({status: 'testing'});
    const data = connectionData();
    new LoginRequest().login({userData: {username: data.username, password}, connectionData: data})
      .then((user) => {
        // only test - session is closed at once
        new DisconnectRequest().disconnect({user, connection: data});
        setTest({status: 'ok', message: `Connected as ${user.username}`});
      })
      .catch((e) => setTest({status: 'error', message: e?.response?.data?.error || 'Server did not accept connection'}));
  };

  const save = (connect: boolean) => {
    setSubmitted(true);
    if (!valid) return;
    const data = connectionData();
    ConnectionSettings.getInstance().addNewConnection(data);
    if (connect) {
      EventBus.emit(new ConnectionFormWasSubmitted({userData: {username: data.username, password}, connectionData: data}));
    }
    // ready for next connection
    setName('');
    setPassword('');
    setDatabase('');
    setDsnText('');
    setColor('');
    setReadOnly(false);
    setConfirm(false);
    setTest({status: 'idle'});
    setSubmitted(false);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save(true);
  };

  const shown = (error: string | null) => submitted && error ? <div className="field-error">{error}</div> : null;

  return (
    <div className="cmp-new-connection">
      <form className="new-connection-card" onSubmit={onSubmit} noValidate>
        <div className="new-connection-header">
          <div className="new-connection-mark"><FontAwesomeIcon icon={faPlug} /></div>
          <div>
            <h1>New connection</h1>
            <p>MySQL, MariaDB or PostgreSQL server. Connection is saved in this browser, password never.</p>
          </div>
        </div>

        <section>
          <h2>Database engine</h2>
          <div className="engine-options" role="radiogroup">
            {ENGINES.map((item) => (
              <button
                key={item.value}
                type="button"
                role="radio"
                aria-checked={engine === item.value}
                className={`engine-option ${engine === item.value ? 'selected' : ''}`}
                onClick={() => changeEngine(item.value)}
              >
                <FontAwesomeIcon icon={faDatabase} />
                <span className="engine-name">{item.label}</span>
                <span className="engine-hint">{item.hint} · port {item.port}</span>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="section-title">
            <h2>Server</h2>
            <div className="mode-switch">
              <button type="button" className={mode === 'host' ? 'active' : ''} onClick={() => changeMode('host')}>Host &amp; port</button>
              <button type="button" className={mode === 'dsn' ? 'active' : ''} onClick={() => changeMode('dsn')}>DSN</button>
            </div>
          </div>
          {mode === 'host' ? (
            <div className="field-row">
              <label className="field grow">
                <span>Host</span>
                <input value={host} onChange={(e) => { setHost(e.target.value); setTest({status: 'idle'}); }} placeholder="localhost" autoFocus />
              </label>
              <label className="field port">
                <span>Port</span>
                <input value={port} inputMode="numeric" onChange={(e) => { setPort(e.target.value.replace(/\D/g, '')); setTest({status: 'idle'}); }} />
              </label>
              <label className="field grow">
                <span>Database <em>{engine === 'postgresql' ? 'default postgres' : 'optional'}</em></span>
                <input value={database} onChange={(e) => { setDatabase(e.target.value); setTest({status: 'idle'}); }}
                  placeholder={engine === 'postgresql' ? 'postgres' : 'all databases'} />
              </label>
            </div>
          ) : (
            <label className="field">
              <span>DSN</span>
              <input value={dsnText} onChange={(e) => changeDsn(e.target.value)} placeholder="mysql://host:3306 · postgresql://host:5432/database" autoFocus spellCheck={false} />
            </label>
          )}
          {mode === 'host' && <div className="dsn-preview" title="Address used by Flase server">{dsn}</div>}
          {mode === 'host' ? shown(errors.dsn && host.trim() ? errors.dsn : null) : shown(errors.dsn)}
        </section>

        <section>
          <h2>Authentication</h2>
          <div className="field-row">
            <label className="field grow">
              <span>User</span>
              <input value={username} onChange={(e) => { setUsername(e.target.value); setTest({status: 'idle'}); }} autoComplete="username" />
              {shown(errors.username)}
            </label>
            <label className="field grow">
              <span>Password <em>not saved</em></span>
              <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setTest({status: 'idle'}); }} autoComplete="current-password" />
            </label>
          </div>
        </section>

        <section>
          <h2>Appearance</h2>
          <div className="field-row">
            <label className="field grow">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder={suggestedName || 'e.g. Production shop'} />
              {shown(errors.name)}
            </label>
            <div className="field">
              <span>Color</span>
              <div className="color-options">
                {CONNECTION_COLORS.map((item) => (
                  <button
                    key={item.value || 'none'}
                    type="button"
                    title={item.label}
                    aria-label={item.label}
                    className={`color-option ${color === item.value ? 'selected' : ''} ${item.value ? '' : 'none'}`}
                    style={item.value ? {backgroundColor: item.value} : undefined}
                    onClick={() => setColor(item.value)}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2>Safety</h2>
          <div className="option-cards">
            <label className={`option-card ${readOnly ? 'checked' : ''}`}>
              <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
              <FontAwesomeIcon icon={faLock} />
              <span>
                <strong>Read only</strong>
                <small>Editing, structure changes, import and statements changing data are refused. Good for production.</small>
              </span>
            </label>
            <label className={`option-card ${confirm ? 'checked' : ''}`}>
              <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
              <FontAwesomeIcon icon={faShieldHalved} />
              <span>
                <strong>Confirm every change</strong>
                <small>SQL of each change is shown before it is executed.</small>
              </span>
            </label>
          </div>
        </section>

        <div className="new-connection-footer">
          <div className={`test-result ${test.status}`} role="status">
            {test.status === 'testing' && 'Connecting…'}
            {test.status === 'ok' && <><FontAwesomeIcon icon={faCircleCheck} /> {test.message}</>}
            {test.status === 'error' && <><FontAwesomeIcon icon={faCircleXmark} /> {test.message}</>}
          </div>
          <button type="button" className="secondary" onClick={testConnection} disabled={test.status === 'testing'}>Test connection</button>
          <button type="button" className="secondary" onClick={() => save(false)}>Save</button>
          <button type="submit" className="primary">Save &amp; connect</button>
        </div>
      </form>
    </div>
  );
}
