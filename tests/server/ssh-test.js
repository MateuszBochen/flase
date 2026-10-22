// SSH tunnel of database connections: node ssh-test.js <base url>
// flase_ssh (docker/ssh) is the bastion - databases are on its 127.0.0.1 only (13306 mysql, 13307 mariadb, 15432 postgres),
// run.sh copies its test keys to server/certs (ssh-test-key, ssh-test-key-pass with passphrase "secret")
const WebSocket = require('ws');
const fs = require('fs');
const BASE = process.argv[2] || 'http://php_flase:3001';
const WS = BASE.replace(/^http/, 'ws');
const KEY_WITH_PASSPHRASE = process.env.SSH_KEY_PASS_FILE || '/certs/ssh-test-key-pass';
let failures = 0;
const check = (name, ok, info = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SSH = {host: 'ssh', port: 22, username: 'tunnel'};
let hostKey = null;

const login = async (dsn, ssh, secrets = {password: 'tunnel'}, user = 'flase') => {
  const connection = {id: 'ssh-' + Math.random(), dsn, username: user, displayName: dsn, changeConfirmationRequired: false, ...(ssh ? {ssh} : {})};
  const res = await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: user, password: 'flase', ...(secrets ? {ssh: secrets} : {})}, connectionData: connection})});
  const body = await res.json();
  return {ok: res.status === 200, status: res.status, error: body.error, sshHostKey: body.sshHostKey, user: body, connection};
};

/** first value of first row of statement */
const value = async ({user, connection}, sql, ws_base = WS) => {
  const ws = new WebSocket(`${ws_base}/ws/${user.token}`);
  const messages = [];
  ws.on('message', (m) => messages.push(JSON.parse(m)));
  await new Promise((r) => ws.on('open', r));
  const tabId = 'ssh' + Math.random();
  ws.send(JSON.stringify({connectionData: {user, connection}, command: 'EXECUTE_STATEMENTS', payload: {tabId, database: null, statements: [sql]}}));
  for (let i = 0; i < 300 && !messages.find((m) => m.payload?.tabId === tabId && m.message === 'EXECUTION_FINISHED'); i++) await sleep(30);
  ws.close();
  const error = messages.find((m) => m.message === 'QUERY_ERROR');
  if (error) return `ERROR ${error.payload.error}`;
  const row = messages.find((m) => m.payload?.tabId === `${tabId}:0` && m.message === 'SINGLE_SELECT_RECORD')?.payload?.rowDataValue;
  return row ? Object.values(row).pop() : undefined;
};

/** all SSH sessions of user tunnel are ended on bastion (also the one of Flase tunnel) */
const killTunnelSessions = () => new Promise((resolve) => {
  const {Client} = require('ssh2');
  const client = new Client();
  client.on('ready', () => client.exec('pkill -u tunnel', () => setTimeout(resolve, 300)));
  client.on('error', () => resolve());
  client.on('close', () => resolve());
  client.connect({host: SSH.host, port: 22, username: 'tunnel', password: 'tunnel'});
});

(async () => {
  console.log('=== host key');
  let r = await login('mysql://127.0.0.1:13307', SSH);
  check('unknown host key: login refused with fingerprint', !r.ok && /^SHA256:[A-Za-z0-9+/]{43}$/.test(r.sshHostKey?.fingerprint || '') && r.sshHostKey.changed === false
    && /not known/.test(r.error), JSON.stringify(r.sshHostKey) + ' ' + r.error);
  hostKey = r.sshHostKey?.fingerprint;
  const tunnel = {...SSH, hostKey};
  r = await login('mysql://127.0.0.1:13307', {...SSH, hostKey: 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'});
  check('changed host key refused', !r.ok && r.sshHostKey?.changed === true && r.sshHostKey.fingerprint === hostKey && /has changed/.test(r.error), r.error);

  console.log('\n=== databases behind bastion');
  r = await login('mysql://127.0.0.1:13307');
  check('database is not reachable without tunnel', !r.ok, r.error);
  for (const [name, dsn, sql] of [
    ['mariadb', 'mariadb://127.0.0.1:13307/shop', 'SELECT VERSION()'],
    ['mysql', 'mysql://127.0.0.1:13306', 'SELECT VERSION()'],
    ['postgres', 'postgresql://127.0.0.1:15432/shop', 'SELECT version()'],
  ]) {
    r = await login(dsn, tunnel);
    const version = r.ok ? String(await value(r, sql)) : '';
    check(`${name}: login and query through tunnel`, r.ok && /\d+\.\d+/.test(version) && (name !== 'mariadb' || /MariaDB/i.test(version)), r.error || version);
  }
  r = await login('mysql://127.0.0.1:13307', tunnel);
  const client = r.ok ? await value(r, "SELECT SUBSTRING_INDEX(HOST, ':', 1) FROM information_schema.PROCESSLIST WHERE ID = CONNECTION_ID()") : '';
  check('database sees connection from bastion', r.ok && !!client && client !== 'localhost', client);

  r = await login('postgresql://127.0.0.1:15432/shop?sslmode=require', tunnel);
  const ssl = r.ok ? await value(r, 'SELECT ssl::text FROM pg_stat_ssl WHERE pid = pg_backend_pid()') : '';
  check('TLS of database inside tunnel', r.ok && ssl === 'true', r.error || ssl);

  // other database of PostgreSQL server - the same tunnel settings, password is not sent again
  const pg = await login('postgresql://127.0.0.1:15432', tunnel);
  const res = await fetch(`${BASE}/api/login/database`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: pg.user.token, database: 'shop'})});
  const catalog = await res.json();
  check('other database of PostgreSQL through tunnel', res.status === 200 && await value({user: catalog, connection: pg.connection}, 'SELECT current_database()') === 'shop', catalog.error);

  console.log('\n=== SSH connection lost');
  r = await login('mysql://127.0.0.1:13307', tunnel);
  check('query before', r.ok && await value(r, 'SELECT 1') == 1, r.error);
  await killTunnelSessions();
  await sleep(500);
  const after = await value(r, 'SELECT 2');
  check('query after SSH connection was lost - tunnel connects again', after == 2, after);

  console.log('\n=== authentication');
  r = await login('mysql://127.0.0.1:13307', tunnel, {password: 'wrong'});
  check('wrong SSH password', !r.ok && /SSH login to tunnel@ssh:22 failed/.test(r.error), r.error);
  r = await login('mysql://127.0.0.1:13307', tunnel, null);
  check('no SSH password or key', !r.ok && /SSH login/.test(r.error), r.error);
  r = await login('mysql://127.0.0.1:13307', {...tunnel, keyFile: 'ssh-test-key'}, {});
  check('key file from FLASE_SSH_KEY_DIR', r.ok && await value(r, 'SELECT 1') == 1, r.error);
  r = await login('mysql://127.0.0.1:13307', {...tunnel, keyFile: '../../../../etc/passwd'}, {});
  check('key file outside of directory refused', !r.ok && /FLASE_SSH_KEY_DIR/.test(r.error), r.error);
  r = await login('mysql://127.0.0.1:13307', {...tunnel, keyFile: 'missing-key'}, {});
  check('missing key file', !r.ok && /missing-key was not found/.test(r.error), r.error);
  const encrypted = fs.readFileSync(KEY_WITH_PASSPHRASE, 'utf8');
  r = await login('mysql://127.0.0.1:13307', tunnel, {privateKey: encrypted});
  check('encrypted key without passphrase', !r.ok && /passphrase/i.test(r.error), r.error);
  r = await login('mysql://127.0.0.1:13307', tunnel, {privateKey: encrypted, passphrase: 'wrong'});
  check('wrong passphrase', !r.ok && /SSH private key/i.test(r.error), r.error);
  r = await login('mysql://127.0.0.1:13307', tunnel, {privateKey: encrypted, passphrase: 'secret'});
  check('pasted key with passphrase', r.ok && await value(r, 'SELECT 1') == 1, r.error);
  r = await login('mysql://127.0.0.1:13307', tunnel, {privateKey: 'not a key'});
  check('invalid pasted key', !r.ok && /SSH private key/i.test(r.error), r.error);

  console.log('\n=== errors');
  r = await login('mysql://127.0.0.1:13999', tunnel);
  check('database not reachable from bastion', !r.ok && /could not connect to database 127.0.0.1:13999/.test(r.error), r.error);
  r = await login('mysql://127.0.0.1:13307', {...tunnel, username: 'nofwd'}, {password: 'nofwd'});
  check('forwarding not allowed for user', !r.ok && /could not connect to database/.test(r.error), r.error);
  r = await login('mysql://127.0.0.1:13307', {...tunnel, port: 2999});
  check('SSH server not listening', !r.ok && /refused/i.test(r.error), r.error);
  r = await login('mysql://127.0.0.1:13307', {...tunnel, host: 'no-such-bastion.invalid'});
  check('unknown SSH host', !r.ok && /not found/i.test(r.error), r.error);
  r = await login('mysql://127.0.0.1:13307', {...tunnel, port: 70000});
  check('invalid port refused', r.status === 400 && /SSH port/.test(r.error), r.error);
  r = await login('mysql://127.0.0.1:13307', {host: 'ssh'});
  check('SSH user required', r.status === 400 && /SSH user/.test(r.error), r.error);
  r = await login('mysql://127.0.0.1:13307', tunnel, {password: 'tunnel'}, 'nobody');
  check('wrong database user through tunnel', !r.ok && /Access denied/i.test(r.error), r.error);

  if (process.env.PREDEFINED_URL) {
    console.log('\n=== tunnel defined by administrator');
    const config = await (await fetch(`${process.env.PREDEFINED_URL}/api/config`)).json();
    const text = JSON.stringify(config);
    const behind = config.connections.find((item) => item.displayName === 'Behind bastion');
    check('settings of tunnel are not sent to browser', behind?.sshTunnel === true && !behind.ssh && !/ssh-test-key|tunnel"|hostKey|"ssh"/.test(text), text);
    const predefinedLogin = async (connection, ssh) => {
      const res = await fetch(`${process.env.PREDEFINED_URL}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({userData: {username: 'flase', password: 'flase', ssh: {password: 'x'}}, connectionData: {...connection, ...(ssh ? {ssh} : {})}})});
      return {status: res.status, body: await res.json()};
    };
    let result = await predefinedLogin(behind);
    const version = result.status === 200 ? String(await value({user: result.body, connection: behind}, 'SELECT VERSION()', process.env.PREDEFINED_URL.replace(/^http/, 'ws'))) : '';
    check('login through tunnel of configuration (key file)', /MariaDB/.test(version), result.body.error || version);
    // tunnel sent by browser is ignored - predefined connection cannot be sent elsewhere
    result = await predefinedLogin(behind, {host: 'no-such-bastion.invalid', username: 'x'});
    check('tunnel from browser is ignored', result.status === 200, result.body.error);
    const unknown = config.connections.find((item) => item.displayName === 'Unknown key');
    result = await predefinedLogin(unknown);
    check('unknown host key: administrator has to set it, user cannot confirm it', result.status === 401 && !result.body.sshHostKey
      && /administrator has to set ssh.hostKey/.test(result.body.error) && result.body.error.includes(hostKey), result.body.error);
  }

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
