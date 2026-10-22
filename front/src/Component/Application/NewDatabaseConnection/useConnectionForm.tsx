import React, {useMemo, useState} from 'react';
import {v4 as uuidv4} from 'uuid';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faCircleCheck, faCircleXmark, faDatabase, faLock, faShieldHalved} from '@fortawesome/free-solid-svg-icons';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import ConnectionSettings from '../../../Library/Connection/ConnectionSettings';
import {CONNECTION_COLORS} from '../../../Library/Connection/ConnectionColors';
import LoginRequest from '../../../Library/API/Request/LoginRequest';
import DisconnectRequest from '../../../Library/API/Request/DisconnectRequest';
import PasswordVault from '../../../Library/Connection/PasswordVault';
import ConnectionUserDataInterface from '../../../Library/Connection/Interface/ConnectionUserDataInterface';
import {SshAuthType, SshConfigInterface, SshHostKeyInterface, sshSecretsOf} from '../../../Library/Connection/Ssh/SshTunnelInterface';
import SshKeyInput from '../../SshTunnel/SshKeyInput';
import './style.css';

type EngineType = 'mysql' | 'mariadb' | 'postgresql';
type ModeType = 'host' | 'dsn';
export type TestStateType = {status: 'idle' | 'testing' | 'ok' | 'error', message?: string, hostKey?: SshHostKeyInterface};

const ENGINES: {value: EngineType, label: string, port: string, hint: string}[] = [
  {value: 'mysql', label: 'MySQL', port: '3306', hint: '5.7, 8.x'},
  {value: 'mariadb', label: 'MariaDB', port: '3306', hint: '10.x, 11.x'},
  {value: 'postgresql', label: 'PostgreSQL', port: '5432', hint: '12 and newer'},
];

const SSH_AUTHS: {value: SshAuthType, label: string, hint: string}[] = [
  {value: 'password', label: 'Password', hint: 'Password of SSH user'},
  {value: 'key', label: 'Private key', hint: 'Key file of this computer or pasted - sent with login, kept only when remembered'},
  {value: 'keyFile', label: 'Key on Flase server', hint: 'File in SSH key directory of server (FLASE_SSH_KEY_DIR)'},
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

/** form starts with values of the connection (DSN of other shape than built from fields stays in DSN mode) */
const initialOf = (connection?: ConnectionDataInterface) => {
  const match = connection ? DSN_PATTERN.exec(connection.dsn) : null;
  if (!connection || !match) {
    return {engine: 'mysql' as EngineType, mode: (connection ? 'dsn' : 'host') as ModeType, host: 'localhost', port: '3306', database: '', tls: NO_TLS, dsnText: connection?.dsn || ''};
  }
  const engine = engineOf(match[1]);
  const fields = {engine, host: match[2], port: match[3] || ENGINES.find((item) => item.value === engine)!.port, database: match[4] || '', tls: tlsOfQuery(match[5])};
  const sameAsBuilt = buildDsn(fields.engine, fields.host, fields.port, fields.database, fields.tls) === connection.dsn;
  return {...fields, mode: (sameAsBuilt ? 'host' : 'dsn') as ModeType, dsnText: connection.dsn};
};

interface ConnectionFormOptionsInterface {
  /** edited connection - without it a new one is made */
  connection?: ConnectionDataInterface;
  /** connection is open - address and user of its session cannot be changed */
  locked?: boolean;
}

/**
 * useConnectionForm - fields of connection (engine, server, TLS, user, name, color, safety) for new connection tab
 * and edit popup; the caller renders `fields` and its own buttons
 */
export default (options: ConnectionFormOptionsInterface = {}) => {
  const {connection, locked = false} = options;
  const [initial] = useState(() => initialOf(connection));
  const [engine, setEngine] = useState<EngineType>(initial.engine);
  const [mode, setMode] = useState<ModeType>(initial.mode);
  const [host, setHost] = useState<string>(initial.host);
  const [port, setPort] = useState<string>(initial.port);
  const [database, setDatabase] = useState<string>(initial.database);
  const [dsnText, setDsnText] = useState<string>(initial.dsnText);
  const [tls, setTls] = useState<TlsType>(initial.tls);
  const [username, setUsername] = useState<string>(connection?.username || '');
  const [password, setPassword] = useState<string>('');
  const [name, setName] = useState<string>(connection?.displayName || '');
  const [color, setColor] = useState<string>(connection?.color || '');
  const [readOnly, setReadOnly] = useState<boolean>(!!connection?.readOnly);
  const [confirm, setConfirm] = useState<boolean>(!!connection?.changeConfirmationRequired);
  const [rememberPassword, setRememberPassword] = useState<boolean>(false);
  const [test, setTest] = useState<TestStateType>({status: 'idle'});
  // SSH tunnel - secrets are sent with login, saved only by Remember password
  const [sshEnabled, setSshEnabled] = useState<boolean>(!!connection?.ssh);
  const [sshHost, setSshHost] = useState<string>(connection?.ssh?.host || '');
  const [sshPort, setSshPort] = useState<string>(String(connection?.ssh?.port || 22));
  const [sshUser, setSshUser] = useState<string>(connection?.ssh?.username || '');
  const [sshAuth, setSshAuth] = useState<SshAuthType>(connection?.ssh?.auth || 'password');
  const [sshKeyFile, setSshKeyFile] = useState<string>(connection?.ssh?.keyFile || '');
  const [sshHostKey, setSshHostKey] = useState<string>(connection?.ssh?.hostKey || '');
  const [sshPassword, setSshPassword] = useState<string>('');
  const [sshPrivateKey, setSshPrivateKey] = useState<string>('');
  const [sshPassphrase, setSshPassphrase] = useState<string>('');
  const [submitted, setSubmitted] = useState<boolean>(false);

  const dsn = mode === 'host' ? buildDsn(engine, host, port, database, tls) : dsnText.trim();
  const dsnValid = DSN_PATTERN.test(dsn);
  const parsed = DSN_PATTERN.exec(dsn);
  const suggestedName = parsed ? `${parsed[2]}${parsed[4] ? ` · ${parsed[4]}` : ''}` : '';
  const displayName = name.trim() || suggestedName;
  const nameTaken = useMemo(
    () => ConnectionSettings.getInstance().getConnections().some((item) => item.id !== connection?.id && item.displayName === displayName),
    [displayName, submitted, connection?.id],
  );

  const errors = {
    dsn: !dsnValid ? (mode === 'dsn' && !dsnText.trim() ? 'DSN is required' : 'Expected e.g. mysql://host:3306 or postgresql://host:5432/database') : null,
    username: !username.trim() ? 'User is required' : null,
    name: !displayName ? 'Name is required' : nameTaken ? 'Connection with this name already exists' : null,
    sshHost: sshEnabled && !sshHost.trim() ? 'SSH host is required' : null,
    sshPort: sshEnabled && !(Number(sshPort) >= 1 && Number(sshPort) <= 65535) ? 'Port 1 - 65535' : null,
    sshUser: sshEnabled && !sshUser.trim() ? 'SSH user is required' : null,
    sshKeyFile: sshEnabled && sshAuth === 'keyFile' && !sshKeyFile.trim() ? 'Name of key file is required' : null,
  };
  const sshValid = !errors.sshHost && !errors.sshPort && !errors.sshUser && !errors.sshKeyFile;
  const valid = !errors.dsn && !errors.username && !errors.name && sshValid;

  /** field of tunnel changed - result of test is not valid any more */
  const sshChange = (setter: (value: any) => void) => (value: any) => {
    setter(value);
    setTest({status: 'idle'});
  };

  const sshConfig = (): SshConfigInterface | undefined => sshEnabled ? {
    host: sshHost.trim(),
    port: Number(sshPort) || 22,
    username: sshUser.trim(),
    auth: sshAuth,
    ...(sshHostKey.trim() ? {hostKey: sshHostKey.trim()} : {}),
    ...(sshAuth === 'keyFile' ? {keyFile: sshKeyFile.trim()} : {}),
  } : undefined;

  /** user, password and secrets of tunnel for login */
  const userData = (): ConnectionUserDataInterface => ({
    username: username.trim(),
    password,
    ...(sshEnabled ? {ssh: sshSecretsOf(sshAuth, {password: sshPassword, privateKey: sshPrivateKey, passphrase: sshPassphrase})} : {}),
  });

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

  /** connection of form - edited one keeps its id */
  const connectionData = (): ConnectionDataInterface => ({
    ...(connection || {}),
    id: connection?.id || uuidv4(),
    displayName,
    dsn,
    username: username.trim(),
    color: color || undefined,
    readOnly,
    changeConfirmationRequired: confirm,
    ssh: sshConfig(),
  });

  /** hostKey - confirmed key of SSH server used before it is in state */
  const testConnection = (hostKey?: string) => {
    setSubmitted(true);
    if (errors.dsn || errors.username || !sshValid) return;
    setTest({status: 'testing'});
    // test session has its own id - session of edited connection is not touched
    const base = {...connectionData(), id: uuidv4()};
    const data = hostKey && base.ssh ? {...base, ssh: {...base.ssh, hostKey}} : base;
    new LoginRequest().login({userData: userData(), connectionData: data})
      .then((user) => {
        // only test - session is closed at once
        new DisconnectRequest().disconnect({user, connection: data});
        setTest({status: 'ok', message: `Connected as ${user.username}${data.ssh ? ` through SSH ${data.ssh.host}` : ''}`});
      })
      .catch((e) => setTest({status: 'error', message: e?.response?.data?.error || 'Server did not accept connection', hostKey: e?.response?.data?.sshHostKey}));
  };

  /** host key shown by test is confirmed - saved with connection, test runs again */
  const trustHostKey = (fingerprint: string) => {
    setSshHostKey(fingerprint);
    testConnection(fingerprint);
  };

  /** connection of valid form, null shows errors */
  const validated = (): ConnectionDataInterface | null => {
    setSubmitted(true);
    return valid ? connectionData() : null;
  };

  /** ready for next connection */
  const reset = () => {
    setName('');
    setPassword('');
    setDatabase('');
    setDsnText('');
    setTls(NO_TLS);
    setColor('');
    setReadOnly(false);
    setConfirm(false);
    setRememberPassword(false);
    setSshEnabled(false);
    setSshHostKey('');
    setSshPassword('');
    setSshPrivateKey('');
    setSshPassphrase('');
    setTest({status: 'idle'});
    setSubmitted(false);
  };

  const shown = (error: string | null) => submitted && error ? <div className="field-error">{error}</div> : null;

  const fields = (
    <>
      {locked && <div className="field-hint locked-hint">Connection is open - disconnect to change engine, server, security or user.</div>}
      <fieldset className="connection-address" disabled={locked}>
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
                <input value={host} onChange={(e) => { setHost(e.target.value); setTest({status: 'idle'}); }} placeholder="localhost" autoFocus={!connection} />
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
              <input value={dsnText} onChange={(e) => changeDsn(e.target.value)} placeholder="mysql://host:3306 · postgresql://host:5432/database" autoFocus={!connection} spellCheck={false} />
            </label>
          )}
          {mode === 'host' && <div className="dsn-preview" title="Address used by Flase server">{dsn}</div>}
          {sshEnabled && <div className="field-hint">Through SSH tunnel the host is the address of database as seen from SSH server - e.g. 127.0.0.1 when database runs on it.</div>}
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

        <section className="ssh-section">
          <div className="section-title">
            <h2>SSH tunnel</h2>
            <label className="ssh-toggle">
              <input type="checkbox" checked={sshEnabled} onChange={(e) => sshChange(setSshEnabled)(e.target.checked)} />
              Connect through SSH server
            </label>
          </div>
          {sshEnabled && (
            <>
              <div className="field-row">
                <label className="field grow">
                  <span>SSH host</span>
                  <input value={sshHost} onChange={(e) => sshChange(setSshHost)(e.target.value)} placeholder="bastion.example.com" spellCheck={false} />
                  {shown(errors.sshHost)}
                </label>
                <label className="field port">
                  <span>Port</span>
                  <input value={sshPort} inputMode="numeric" onChange={(e) => sshChange(setSshPort)(e.target.value.replace(/\D/g, ''))} />
                  {shown(errors.sshPort)}
                </label>
                <label className="field grow">
                  <span>SSH user</span>
                  <input value={sshUser} onChange={(e) => sshChange(setSshUser)(e.target.value)} autoComplete="off" spellCheck={false} />
                  {shown(errors.sshUser)}
                </label>
              </div>
              <div className="tls-options ssh-auth-options" role="radiogroup">
                {SSH_AUTHS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    role="radio"
                    aria-checked={sshAuth === item.value}
                    className={`tls-option ${sshAuth === item.value ? 'selected' : ''}`}
                    onClick={() => sshChange(setSshAuth)(item.value)}
                  >
                    <span className="tls-name">{item.label}</span>
                    <span className="tls-hint">{item.hint}</span>
                  </button>
                ))}
              </div>
              {sshAuth === 'password' && (
                <label className="field">
                  <span>SSH password <em>not saved unless remembered</em></span>
                  <input type="password" value={sshPassword} onChange={(e) => sshChange(setSshPassword)(e.target.value)} autoComplete="off" />
                </label>
              )}
              {sshAuth === 'key' && (
                <div className="field">
                  <span>Private key <em>not saved unless remembered</em></span>
                  <SshKeyInput value={sshPrivateKey} onChange={sshChange(setSshPrivateKey)} disabled={locked} />
                </div>
              )}
              {sshAuth === 'keyFile' && (
                <label className="field">
                  <span>Key file on Flase server</span>
                  <input value={sshKeyFile} onChange={(e) => sshChange(setSshKeyFile)(e.target.value)} placeholder="id_ed25519" spellCheck={false} />
                  {shown(errors.sshKeyFile)}
                </label>
              )}
              {sshAuth !== 'password' && (
                <label className="field">
                  <span>Key passphrase <em>only for encrypted key</em></span>
                  <input type="password" value={sshPassphrase} onChange={(e) => sshChange(setSshPassphrase)(e.target.value)} autoComplete="off" />
                </label>
              )}
              <label className="field">
                <span>Host key <em>filled in when you confirm the key of SSH server at first connection</em></span>
                <input value={sshHostKey} onChange={(e) => sshChange(setSshHostKey)(e.target.value)} placeholder="SHA256:…" spellCheck={false} />
              </label>
            </>
          )}
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
              <span>Password <em>not saved unless remembered</em></span>
              <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setTest({status: 'idle'}); }} autoComplete="current-password" />
            </label>
          </div>
          <label className={`remember-password ${PasswordVault.isAvailable() ? '' : 'unavailable'}`}
            title={PasswordVault.isAvailable() ? undefined : 'Available only over HTTPS (or localhost)'}>
            <input type="checkbox" checked={rememberPassword} disabled={!PasswordVault.isAvailable()} onChange={(e) => setRememberPassword(e.target.checked)} />
            {sshEnabled ? 'Remember passwords and SSH key' : 'Remember password'} in this browser (encrypted, used by Save &amp; connect)
          </label>
        </section>
      </fieldset>
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
    </>
  );

  const testResult = (
    <div className={`test-result ${test.status}`} role="status">
      {test.status === 'testing' && 'Connecting…'}
      {test.status === 'ok' && <><FontAwesomeIcon icon={faCircleCheck} /> {test.message}</>}
      {test.status === 'error' && <><FontAwesomeIcon icon={faCircleXmark} /> {test.message}</>}
      {test.status === 'error' && test.hostKey && (
        <button type="button" className={`trust-host-key ${test.hostKey.changed ? 'changed' : ''}`} onClick={() => trustHostKey(test.hostKey!.fingerprint)}>
          {test.hostKey.changed ? 'Trust new key' : 'Trust this key'}
        </button>
      )}
    </div>
  );

  return {fields, testResult, test, testConnection: () => testConnection(), validated, reset, userData, rememberPassword: PasswordVault.isAvailable() && rememberPassword};
};
