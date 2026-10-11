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
import {useServerConfig} from '../../../Library/Config/ServerConfig';
import PasswordVault from '../../../Library/Connection/PasswordVault';
import './style.css';

type EngineType = 'mysql' | 'mariadb' | 'postgresql';
type ModeType = 'host' | 'dsn';
type TestStateType = {status: 'idle' | 'testing' | 'ok' | 'error', message?: string};

const ENGINES: {value: EngineType, label: string, port: string, hint: string}[] = [
  {value: 'mysql', label: 'MySQL', port: '3306', hint: '5.7, 8.x'},
  {value: 'mariadb', label: 'MariaDB', port: '3306', hint: '10.x, 11.x'},
  {value: 'postgresql', label: 'PostgreSQL', port: '5432', hint: '12 and newer'},
];

const DSN_PATTERN = /^(mysql|mariadb|postgresql|postgres|pgsql):\/\/([^/:?#\s]+)(?::(\d+))?(?:\/([^?#\s]*))?(?:\?(\S*))?$/i;

type TlsModeType = 'disable' | 'require' | 'verify-ca' | 'verify-full';
type TlsType = {mode: TlsModeType, ca: string, cert: string, key: string};
const NO_TLS: TlsType = {mode: 'disable', ca: '', cert: '', key: ''};

const TLS_MODES: {value: TlsModeType, label: string, hint: string}[] = [
  {value: 'disable', label: 'Disabled', hint: 'Not encrypted - only for local or private network'},
  {value: 'require', label: 'Required', hint: 'Encrypted, certificate of server is not checked'},
  {value: 'verify-ca', label: 'Verify CA', hint: 'Encrypted, certificate signed by trusted CA'},
  {value: 'verify-full', label: 'Verify CA and host', hint: 'Encrypted, trusted certificate issued for this host name - the safest'},
];

/** sslmode of DSN (also MySQL names) - the same values as server accepts */
const TLS_ALIASES: {[value: string]: TlsModeType} = {
  'disable': 'disable', 'disabled': 'disable', 'false': 'disable', '0': 'disable',
  'require': 'require', 'required': 'require', 'true': 'require', '1': 'require',
  'verify-ca': 'verify-ca', 'verify_ca': 'verify-ca', 'verify-full': 'verify-full', 'verify_full': 'verify-full', 'verify_identity': 'verify-full', 'verify-identity': 'verify-full',
};

const tlsOfQuery = (query: string | undefined): TlsType => {
  const params = new URLSearchParams(query || '');
  const get = (...names: string[]) => {
    for (const [key, value] of Array.from(params.entries())) {
      if (names.includes(key.toLowerCase())) return value;
    }
    return '';
  };
  return {
    mode: TLS_ALIASES[get('sslmode', 'ssl-mode', 'ssl_mode', 'ssl').toLowerCase()] || 'disable',
    ca: get('sslrootcert', 'ssl-ca', 'ssl_ca', 'sslca'),
    cert: get('sslcert', 'ssl-cert', 'ssl_cert'),
    key: get('sslkey', 'ssl-key', 'ssl_key'),
  };
};

const queryOfTls = (tls: TlsType): string => {
  if (tls.mode === 'disable') return '';
  const params = new URLSearchParams({sslmode: tls.mode});
  if (tls.ca.trim()) params.set('sslrootcert', tls.ca.trim());
  if (tls.cert.trim()) params.set('sslcert', tls.cert.trim());
  if (tls.key.trim()) params.set('sslkey', tls.key.trim());
  return `?${params.toString()}`;
};

/** postgres:// and pgsql:// are PostgreSQL */
const engineOf = (scheme: string): EngineType => {
  const lower = scheme.toLowerCase();
  return lower === 'mysql' || lower === 'mariadb' ? lower : 'postgresql';
};

const buildDsn = (engine: EngineType, host: string, port: string, database: string, tls: TlsType = NO_TLS): string => {
  const defaultPort = ENGINES.find((item) => item.value === engine)!.port;
  return `${engine}://${host.trim() || 'localhost'}:${port.trim() || defaultPort}${database.trim() ? `/${database.trim()}` : ''}${queryOfTls(tls)}`;
};

/** NewDatabaseConnection - engine, address (host / port / database or DSN), user, color and safety options */
export default () => {
  const {allowCustomConnections} = useServerConfig();
  const [engine, setEngine] = useState<EngineType>('mysql');
  const [mode, setMode] = useState<ModeType>('host');
  const [host, setHost] = useState<string>('localhost');
  const [port, setPort] = useState<string>('3306');
  const [database, setDatabase] = useState<string>('');
  const [dsnText, setDsnText] = useState<string>('');
  const [tls, setTls] = useState<TlsType>(NO_TLS);
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [color, setColor] = useState<string>('');
  const [readOnly, setReadOnly] = useState<boolean>(false);
  const [confirm, setConfirm] = useState<boolean>(false);
  const [rememberPassword, setRememberPassword] = useState<boolean>(false);
  const [test, setTest] = useState<TestStateType>({status: 'idle'});
  const [submitted, setSubmitted] = useState<boolean>(false);

  const dsn = mode === 'host' ? buildDsn(engine, host, port, database, tls) : dsnText.trim();
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
      setTls(tlsOfQuery(match[5]));
    }
  };

  const changeTls = (changes: Partial<TlsType>) => {
    setTls((previous) => ({...previous, ...changes}));
    setTest({status: 'idle'});
  };

  const changeMode = (value: ModeType) => {
    if (value === 'dsn' && !dsnText.trim()) {
      setDsnText(buildDsn(engine, host, port, database, tls));
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
      EventBus.emit(new ConnectionFormWasSubmitted({userData: {username: data.username, password}, connectionData: data,
        rememberPassword: PasswordVault.isAvailable() && rememberPassword ? true : undefined}));
    }
    // ready for next connection
    setName('');
    setPassword('');
    setDatabase('');
    setDsnText('');
    setTls(NO_TLS);
    setColor('');
    setReadOnly(false);
    setConfirm(false);
    setRememberPassword(false);
    setTest({status: 'idle'});
    setSubmitted(false);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save(true);
  };

  const shown = (error: string | null) => submitted && error ? <div className="field-error">{error}</div> : null;

  if (!allowCustomConnections) {
    return (
      <div className="cmp-new-connection">
        <div className="new-connection-card">
          <div className="new-connection-header">
            <div className="new-connection-mark"><FontAwesomeIcon icon={faLock} /></div>
            <div>
              <h1>Connections are managed by administrator</h1>
              <p>This Flase server allows only connections defined in its configuration. Use them from the left panel.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="cmp-new-connection">
      <form className="new-connection-card" onSubmit={onSubmit} noValidate>
        <div className="new-connection-header">
          <div className="new-connection-mark"><FontAwesomeIcon icon={faPlug} /></div>
          <div>
            <h1>New connection</h1>
            <p>MySQL, MariaDB or PostgreSQL server. Connection is saved in this browser, password only when you choose to remember it.</p>
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

        {mode === 'host' && (
          <section>
            <h2>Security (TLS)</h2>
            <div className="tls-options" role="radiogroup">
              {TLS_MODES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  role="radio"
                  aria-checked={tls.mode === item.value}
                  className={`tls-option ${tls.mode === item.value ? 'selected' : ''} ${item.value === 'disable' ? 'insecure' : ''}`}
                  title={item.hint}
                  onClick={() => changeTls({mode: item.value})}
                >
                  <span className="tls-name">{item.label}</span>
                  <span className="tls-hint">{item.hint}</span>
                </button>
              ))}
            </div>
            {tls.mode !== 'disable' && (
              <>
                <div className="field-row">
                  <label className="field grow">
                    <span>CA certificate <em>optional</em></span>
                    <input value={tls.ca} onChange={(e) => changeTls({ca: e.target.value})} placeholder="e.g. rds-ca.pem" spellCheck={false} />
                  </label>
                  <label className="field grow">
                    <span>Client certificate <em>optional</em></span>
                    <input value={tls.cert} onChange={(e) => changeTls({cert: e.target.value})} placeholder="client-cert.pem" spellCheck={false} />
                  </label>
                  <label className="field grow">
                    <span>Client key <em>with certificate</em></span>
                    <input value={tls.key} onChange={(e) => changeTls({key: e.target.value})} placeholder="client-key.pem" spellCheck={false} />
                  </label>
                </div>
                <div className="field-hint">
                  Certificates are files in the certificate directory of Flase server (<code>FLASE_CERT_DIR</code>) - only names are written here.
                  {tls.mode === 'require' ? ' CA given with Required turns on verification of certificate.' : ' Without CA the authorities trusted by Node.js are used (public CAs of cloud databases).'}
                </div>
              </>
            )}
          </section>
        )}

        <section>
          <h2>Authentication</h2>
          <div className="field-row">
            <label className="field grow">
              <span>User</span>
              <input value={username} onChange={(e) => { setUsername(e.target.value); setTest({status: 'idle'}); }} autoComplete="username" />
              {shown(errors.username)}
            </label>
            <label className="field grow">
              <span>Password <em>not saved unless remembered</em></span>
              <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setTest({status: 'idle'}); }} autoComplete="current-password" />
            </label>
          </div>
          <label className={`remember-password ${PasswordVault.isAvailable() ? '' : 'unavailable'}`}
            title={PasswordVault.isAvailable() ? undefined : 'Available only over HTTPS (or localhost)'}>
            <input type="checkbox" checked={rememberPassword} disabled={!PasswordVault.isAvailable()} onChange={(e) => setRememberPassword(e.target.checked)} />
            Remember password in this browser (encrypted, used by Save &amp; connect)
          </label>
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
