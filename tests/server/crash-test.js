// Malformed input must never stop the server and errors must be understandable: node crash-test.js <baseUrl>   (run with NODE_PATH pointing to server/node_modules)
const zlib = require('zlib');
const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://php_flase:3001';
const WS_BASE = BASE.replace('http', 'ws');

const conn = (dsn) => ({id: 'crash-' + dsn, dsn, username: 'flase', displayName: dsn, changeConfirmationRequired: false});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};

const alive = async () => {
  for (let i = 0; i < 3; i++) {
    try { if ((await fetch(`${BASE}/api/config`, {signal: AbortSignal.timeout(3000)})).ok) return true; } catch (e) { /* retry */ }
    await sleep(300);
  }
  return false;
};

async function session(dsn) {
  const res = await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: conn(dsn)})});
  const {token, username} = await res.json();
  const ws = new WebSocket(`${WS_BASE}/ws/${token}`);
  const state = {ws, messages: []};
  ws.on('message', (m) => state.messages.push(JSON.parse(m)));
  await new Promise((resolve) => { ws.on('open', resolve); ws.on('close', resolve); });
  const connectionData = {user: {token, username}, connection: conn(dsn)};
  state.send = (command, payload) => ws.send(JSON.stringify({connectionData, command, payload}));
  return state;
}

const COMMANDS = ['RELOAD_DATABASE_LIST', 'RELOAD_TABLES_LIST', 'SEND_SELECT_QUERY', 'APPLY_ROW_CHANGES', 'GET_TABLE_STRUCTURE',
  'CHANGE_STRUCTURE', 'SEARCH_DATABASE', 'EXECUTE_STATEMENTS', 'CANCEL_QUERY', 'GET_PROCESSLIST', 'KILL_PROCESS', 'CREATE_TRANSFER',
  'GET_USERS', 'GET_USER_GRANTS', 'CHANGE_USER', 'GET_DATABASE_OBJECTS', 'GET_SERVER_OPTIONS', 'GET_OBJECT_DDL', 'DATABASE_OPERATION',
  'GET_SERVER_STATUS', 'GET_SERVER_VARIABLES', 'GET_SERVER_INFO', 'SET_SERVER_VARIABLE', 'GET_REPLICATION', 'GET_LOG_EVENTS',
  'REPLICATION_ACTION', 'FIND_REPLACE', 'GET_BINARY_VALUE', 'GET_CATALOGS', 'NOPE', 'constructor', '__proto__'];

(async () => {
  for (const dsn of ['mysql://mariadb', 'postgresql://postgres:5432/shop']) {
    console.log(`\n=== ${dsn}`);
    const s = await session(dsn);
    // valid JSON which is not a command
    for (const raw of ['null', '5', '"x"', '[]', '{}', '{"command": 5}']) s.ws.send(raw);
    await sleep(300);
    check('websocket message which is not a command', await alive());

    // payload null / primitive / array for every command, connectionData of wrong type
    for (const command of COMMANDS) {
      for (const payload of [null, 5, 'x', []]) {
        s.send(command, payload);
        s.ws.send(JSON.stringify({command, payload, connectionData: 7}));
      }
    }
    await sleep(1500);
    check('null / primitive payload of every command', await alive());
    const unknown = s.messages.find((m) => m.message === 'QUERY_ERROR' && m.payload.command === 'constructor');
    check('command "constructor" is not supported', !!unknown && /not supported/.test(unknown.payload.error), unknown?.payload.error);
    s.ws.close();
  }

  // corrupted gzip upload of import
  const gz = zlib.gzipSync('SELECT 1;\n'.repeat(10));
  for (const [name, body] of [['garbage', Buffer.from('not gzip')], ['truncated', gz.subarray(0, gz.length - 10)]]) {
    const s = await session('mysql://mariadb');
    s.send('CREATE_TRANSFER', {tabId: 'gz', transfer: {kind: 'import-sql', database: 'shop', gzip: true, stopOnError: false}});
    await sleep(400);
    const ticket = s.messages.find((m) => m.message === 'TRANSFER_TICKET')?.payload.ticket;
    const res = await fetch(`${BASE}/api/transfer/${ticket}`, {method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body})
      .then(async (r) => [r.status, await r.text()]).catch((e) => ['ERR', e.message]);
    check(`import of ${name} gzip -> error`, res[0] === 500, res.join(' '));
    check(`import of ${name} gzip: server alive`, await alive());
    s.ws.close();
  }

  // errors of API are JSON, never HTML page with stack trace
  let r = await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{bad'});
  let text = await r.text();
  check('invalid JSON body -> 400 JSON error', r.status === 400 && JSON.parse(text).error === 'Invalid JSON in request body', text.slice(0, 100));

  // DSN
  const login = async (dsn) => {
    const started = Date.now();
    const res = await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: conn(dsn)})});
    return {status: res.status, body: await res.text(), ms: Date.now() - started};
  };
  r = await login('mysql://mariadb:0');
  check('DSN port 0 -> error', r.status === 401 && r.body.includes('Invalid port'), r.body);
  r = await login('mysql://mariadb:3306/');
  check('DSN with trailing slash -> login', r.status === 200, r.body.slice(0, 80));
  r = await login('mysql://[::1]:3306');
  check('DSN with IPv6 host is parsed', r.status === 401 && !r.body.includes('parse'), r.body);
  r = await login('mysql://mariadb?sslca=../../../../etc/passwd');
  check('certificate without sslmode is used (outside of certificate directory -> error)', r.status === 401 && r.body.includes('certificate directory'), r.body);
  r = await login('postgresql://10.255.255.1:5432/shop');
  check('unreachable PostgreSQL fails in connect timeout', r.status === 401 && r.ms < 15000 && r.body.includes('did not respond'), `${r.ms} ms ${r.body}`);

  // dump of missing database / table is error, not empty file
  const s = await session('mysql://mariadb');
  for (const [name, options, gzip] of [
    ['missing database', {database: 'nope_db', tables: [], structure: true, data: true}, false],
    ['missing table', {database: 'shop', tables: ['customers', 'nope_table'], structure: true, data: true}, true],
  ]) {
    s.messages.length = 0;
    s.send('CREATE_TRANSFER', {tabId: 'dump', transfer: {kind: 'dump', options, gzip}});
    await sleep(400);
    const ticket = s.messages.find((m) => m.message === 'TRANSFER_TICKET')?.payload.ticket;
    const res = await fetch(`${BASE}/api/transfer/${ticket}`);
    text = await res.text();
    check(`dump of ${name} -> 400`, res.status === 400 && !res.headers.get('content-disposition') && text.startsWith('Dump failed'), `${res.status} ${text.slice(0, 100)}`);
    await sleep(200);
    const finished = s.messages.find((m) => m.message === 'DUMP_FINISHED');
    check(`dump of ${name}: error in websocket`, !!finished?.payload.error, JSON.stringify(finished?.payload));
  }
  check('server alive after dumps', await alive());
  s.ws.close();

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
