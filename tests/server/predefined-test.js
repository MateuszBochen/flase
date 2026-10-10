// Connections defined by administrator (FLASE_CONNECTIONS, FLASE_ALLOW_CUSTOM_CONNECTIONS=false): node predefined-test.js <base url>
// server is started by run.sh with configuration below (PREDEFINED_CONNECTIONS in run.sh)
const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://php_flase:3002';
const WS = BASE.replace(/^http/, 'ws');
let failures = 0;
const check = (name, ok, info = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const login = (connection, password = 'flase') => fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({userData: {username: 'flase', password}, connectionData: connection})});

(async () => {
  // --- configuration for browser
  const config = await (await fetch(`${BASE}/api/config`)).json();
  check('custom connections disabled', config.allowCustomConnections === false, JSON.stringify(config));
  check('valid items only (invalid DSN skipped)', config.connections.length === 2, JSON.stringify(config.connections.map((item) => item.id)));
  const shop = config.connections.find((item) => item.displayName === 'Shop prod');
  const pg = config.connections.find((item) => item.dsn.startsWith('postgresql://'));
  check('object item', shop && shop.id === 'env:shop-prod' && shop.readOnly === true && shop.color === '#d9534f' && shop.username === 'flase'
    && shop.predefined === true, JSON.stringify(shop));
  check('DSN item: name from DSN, credentials removed', pg && pg.displayName === 'postgresql://postgres:5432/shop' && pg.dsn === 'postgresql://postgres:5432/shop'
    && !JSON.stringify(config).includes('secret'), JSON.stringify(pg));

  // --- own connection refused
  let res = await login({id: 'own', dsn: 'mysql://mariadb', username: 'flase', displayName: 'own', changeConfirmationRequired: false});
  check('own connection refused', res.status === 403 && /administrator/.test((await res.json()).error), String(res.status));

  // --- predefined connection: address from server, not from browser
  res = await login({...shop, dsn: 'mysql://not-existing-host:3306'});
  check('predefined: DSN from server configuration', res.status === 200, String(res.status));
  const user = await res.json();
  res = await login({...shop}, 'wrong');
  check('predefined: wrong password still refused', res.status === 401, String(res.status));

  // --- read only enforced by server, browser sends readOnly false
  const ws = new WebSocket(`${WS}/ws/${user.token}`);
  const messages = [];
  ws.on('message', (m) => messages.push(JSON.parse(m)));
  await new Promise((r) => ws.on('open', r));
  const spoofed = {...shop, readOnly: false};
  const send = (command, payload) => ws.send(JSON.stringify({connectionData: {user, connection: spoofed}, command, payload}));
  const waitFor = async (fn, ms = 15000) => { const start = Date.now(); while (Date.now() - start < ms) { const v = fn(); if (v) return v; await sleep(30); } return fn(); };

  let tabId = 'ro-' + Math.random();
  send('EXECUTE_STATEMENTS', {tabId, database: 'shop', statements: ["UPDATE edit_test SET note = 'hacked' WHERE id = 1"]});
  await waitFor(() => messages.find((m) => m.payload?.tabId === tabId && m.message === 'EXECUTION_FINISHED'));
  const statement = messages.find((m) => m.payload?.tabId === tabId && m.message === 'STATEMENT_FINISHED')?.payload;
  // read only database session - statement fails in database
  check('console change refused although browser says readOnly false', /read.only/i.test(statement?.error || ''), JSON.stringify(statement));

  tabId = 'ro2-' + Math.random();
  send('APPLY_ROW_CHANGES', {tabId, database: 'shop', table: {name: 'edit_test', databaseName: 'shop'}, dryRun: false,
    changes: [{kind: 'update', where: {id: 1}, values: {note: 'hacked'}, limitOne: false}]});
  const refused = await waitFor(() => messages.find((m) => m.payload?.tabId === tabId && m.message === 'QUERY_ERROR'));
  check('row change refused by guard', /read only/i.test(refused?.payload?.error || ''), JSON.stringify(refused?.payload));

  tabId = 'ro3-' + Math.random();
  send('EXECUTE_STATEMENTS', {tabId, database: 'shop', statements: ['SELECT note FROM edit_test WHERE id = 1']});
  await waitFor(() => messages.find((m) => m.payload?.tabId === tabId && m.message === 'EXECUTION_FINISHED'));
  const row = messages.find((m) => m.payload?.tabId === `${tabId}:0` && m.message === 'SINGLE_SELECT_RECORD')?.payload?.rowDataValue;
  check('reading works, data unchanged', row && row.note !== 'hacked', JSON.stringify(row));
  ws.close();

  // --- predefined without read only: changes allowed
  res = await login({...pg});
  check('second predefined connection', res.status === 200, String(res.status));

  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
