// TLS of database connections from DSN (sslmode, sslrootcert): node tls-test.js <base url>
// run.sh copies CA of test MySQL (mysql-ca.pem) and certificate of test PostgreSQL (postgres-ca.pem, CN=localhost) to server/certs
const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://php_flase:3001';
const WS = BASE.replace(/^http/, 'ws');
let failures = 0;
const check = (name, ok, info = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = async (dsn) => {
  const connection = {id: 'tls-' + dsn, dsn, username: 'flase', displayName: dsn, changeConfirmationRequired: false};
  const res = await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})});
  const body = await res.json();
  return {ok: res.status === 200, error: body.error, user: body, connection};
};

/** first value of first row of statement */
const value = async ({user, connection}, sql) => {
  const ws = new WebSocket(`${WS}/ws/${user.token}`);
  const messages = [];
  ws.on('message', (m) => messages.push(JSON.parse(m)));
  await new Promise((r) => ws.on('open', r));
  const tabId = 'tls' + Math.random();
  ws.send(JSON.stringify({connectionData: {user, connection}, command: 'EXECUTE_STATEMENTS', payload: {tabId, database: null, statements: [sql]}}));
  for (let i = 0; i < 300 && !messages.find((m) => m.payload?.tabId === tabId && m.message === 'EXECUTION_FINISHED'); i++) await sleep(30);
  ws.close();
  const row = messages.find((m) => m.payload?.tabId === `${tabId}:0` && m.message === 'SINGLE_SELECT_RECORD')?.payload?.rowDataValue;
  return row ? Object.values(row).pop() : undefined;
};

const MYSQL_CIPHER = "SHOW SESSION STATUS LIKE 'Ssl_cipher'";
const PG_SSL = 'SELECT ssl::text FROM pg_stat_ssl WHERE pid = pg_backend_pid()';

(async () => {
  for (const host of ['mysql', 'mariadb']) {
    console.log(`\n=== ${host}`);
    let r = await login(`mysql://${host}`);
    check('without sslmode: not encrypted', r.ok && await value(r, MYSQL_CIPHER) === '', r.error);
    r = await login(`mysql://${host}?sslmode=require`);
    const cipher = r.ok ? await value(r, MYSQL_CIPHER) : '';
    check('sslmode=require: encrypted', r.ok && !!cipher, r.error || cipher);
    r = await login(`mysql://${host}:3306?ssl-mode=REQUIRED`);
    check('MySQL style ssl-mode=REQUIRED', r.ok && !!(await value(r, MYSQL_CIPHER)), r.error);
    r = await login(`mysql://${host}?sslmode=verify-ca`);
    check('verify-ca without CA: self-signed certificate refused', !r.ok && /certificate/i.test(r.error || ''), r.error);
  }

  console.log('\n=== mysql with CA');
  let r = await login('mysql://mysql?sslmode=verify-ca&sslrootcert=mysql-ca.pem');
  check('verify-ca with CA of server', r.ok && !!(await value(r, MYSQL_CIPHER)), r.error);
  r = await login('mysql://mysql?sslmode=require&sslrootcert=mysql-ca.pem');
  check('require with CA is verified (like libpq)', r.ok, r.error);
  r = await login('mysql://mysql?sslmode=verify-full&sslrootcert=mysql-ca.pem');
  check('verify-full: host name not in certificate refused', !r.ok && /altnames|host|identity|does not match/i.test(r.error || ''), r.error);

  console.log('\n=== errors of DSN');
  r = await login('mysql://mysql?sslmode=require&sslrootcert=../../../../etc/passwd');
  check('certificate outside FLASE_CERT_DIR refused', !r.ok && /FLASE_CERT_DIR/.test(r.error || ''), r.error);
  r = await login('mysql://mysql?sslmode=verify-ca&sslrootcert=missing.pem');
  check('missing certificate reported', !r.ok && /missing\.pem was not found/.test(r.error || ''), r.error);
  r = await login('mysql://mysql?sslmode=prefer');
  check('sslmode=prefer explained', !r.ok && /prefer is not supported/.test(r.error || ''), r.error);
  r = await login('mysql://mysql?sslmode=bogus');
  check('unknown sslmode', !r.ok && /Unknown sslmode/.test(r.error || ''), r.error);
  r = await login('mysql://mysql?sslmode=require&sslcert=mysql-ca.pem');
  check('client certificate without key', !r.ok && /sslcert and sslkey/.test(r.error || ''), r.error);

  console.log('\n=== postgres');
  r = await login('postgresql://postgres:5432/shop');
  check('without sslmode: not encrypted', r.ok && await value(r, PG_SSL) === 'false', r.error);
  r = await login('postgresql://postgres:5432/shop?sslmode=require');
  check('sslmode=require: encrypted', r.ok && await value(r, PG_SSL) === 'true', r.error);
  r = await login('postgresql://postgres:5432/shop?sslmode=verify-ca');
  check('verify-ca without CA: self-signed refused', !r.ok && /self-signed|certificate/i.test(r.error || ''), r.error);
  r = await login('postgresql://postgres:5432/shop?sslmode=verify-ca&sslrootcert=postgres-ca.pem');
  check('verify-ca with CA', r.ok && await value(r, PG_SSL) === 'true', r.error);
  r = await login('postgresql://postgres:5432/shop?sslmode=verify-full&sslrootcert=postgres-ca.pem');
  check('verify-full: certificate of localhost, host postgres refused', !r.ok && /altnames|does not match|localhost/i.test(r.error || ''), r.error);

  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
