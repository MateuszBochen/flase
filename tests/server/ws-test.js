// End-to-end test of flase server: node ws-test.js <baseUrl>   (run with NODE_PATH pointing to server/node_modules)
const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://php_flase:3001';
const WS_BASE = BASE.replace('http', 'ws');

const conn = (dsn) => ({id: 'test-' + dsn, dsn, username: 'flase', displayName: dsn, changeConfirmationRequired: false});
const login = async (body) => {
  const res = await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  return {status: res.status, body: await res.text()};
};

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};

function openWs(token) {
  return new Promise((resolve) => {
    const ws = new WebSocket(`${WS_BASE}/ws/${token}`);
    const state = {ws, messages: [], closed: null};
    ws.on('message', (m) => state.messages.push(JSON.parse(m)));
    ws.on('open', () => resolve(state));
    ws.on('close', (code) => { state.closed = code; resolve(state); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 5000) => {
  const start = Date.now();
  while (Date.now() - start < ms) { const v = fn(); if (v) return v; await sleep(50); }
  return fn();
};

(async () => {
  // --- login validation
  let r = await login({});
  check('login empty body -> 400', r.status === 400, r.body);
  r = await login({userData: {username: 'flase', password: 'flase'}, connectionData: conn('foo://mariadb')});
  check('login unsupported driver -> 401 with error', r.status === 401 && r.body.includes('not supported'), r.body);
  r = await login({userData: {username: 'flase', password: 'bad'}, connectionData: conn('mysql://mariadb')});
  check('login bad password -> 401 with error', r.status === 401 && r.body.includes('Access denied'), r.body);

  // --- websocket with invalid token
  const bad = await openWs('nope');
  await waitFor(() => bad.closed, 2000);
  check('ws unknown token closed 4001', bad.closed === 4001, String(bad.closed));

  for (const dsn of ['mysql://mariadb', 'mysql://mysql:3306']) {
    console.log(`\n=== ${dsn}`);
    r = await login({userData: {username: 'flase', password: 'flase'}, connectionData: conn(dsn)});
    check('login ok', r.status === 200, r.body.slice(0, 40));
    const {token, username} = JSON.parse(r.body);
    const {ws, messages} = await openWs(token);
    const connectionData = {user: {token, username}, connection: conn(dsn)};
    const send = (command, payload) => ws.send(JSON.stringify({connectionData, command, payload}));
    const forTab = (tabId) => messages.filter((m) => m.payload && m.payload.tabId === tabId);
    const doneTab = (tabId) => forTab(tabId).find((m) => m.message === 'QUERY_FINISHED' || m.message === 'QUERY_ERROR');
    const select = async (tabId, database, query) => {
      send('SEND_SELECT_QUERY', {query, database: {name: database}, tabId});
      await waitFor(() => doneTab(tabId));
      const msgs = forTab(tabId);
      return {
        msgs,
        done: doneTab(tabId),
        columns: msgs.filter((m) => m.message === 'SINGLE_SELECT_COLUMN').flatMap((m) => m.payload.columns.map((c) => c.name)),
        keys: msgs.filter((m) => m.message === 'SINGLE_SELECT_COLUMN').flatMap((m) => m.payload.columns.map((c) => c.key)),
        total: msgs.find((m) => m.message === 'SELECT_TOTAL_COUNT')?.payload.totalCount,
        rows: msgs.filter((m) => m.message === 'SINGLE_SELECT_RECORD').map((m) => m.payload.rowDataValue),
        order: [...new Set(msgs.map((m) => m.message))].join(' > '),
      };
    };

    send('RELOAD_DATABASE_LIST', null);
    await sleep(500);
    const dbs = messages.filter((m) => m.message === 'DATABASE_BASE_ITEM').map((m) => m.payload.name);
    check('database list', dbs.includes('shop') && dbs.includes('blog'), dbs.join(','));

    send('RELOAD_TABLES_LIST', {name: 'nope_db'});
    await sleep(500);
    const tablesErr = messages.find((m) => m.message === 'QUERY_ERROR' && m.payload.command === 'RELOAD_TABLES_LIST');
    check('tables list of missing db -> QUERY_ERROR', !!tablesErr, tablesErr?.payload.error);

    let s = await select('t1', 'shop', 'SELECT * FROM customers LIMIT 0, 5');
    check('select ok: finished', s.done?.message === 'QUERY_FINISHED' && s.done.payload.rows === 5, s.order);
    check('select ok: total 200', s.total === 200, String(s.total));
    check('select ok: columns from metadata', s.columns.includes('email') && s.columns.includes('city'), s.columns.join(','));

    s = await select('t2', 'shop', 'SELECT * FROM customers WHERE id < 0');
    check('select 0 rows: finished rows=0', s.done?.message === 'QUERY_FINISHED' && s.done.payload.rows === 0 && s.total === 0, s.order);

    s = await select('t3', 'shop', 'SELEC * FROM customers');
    check('syntax error -> QUERY_ERROR', s.done?.message === 'QUERY_ERROR', s.done?.payload.error);

    s = await select('t4', 'shop', 'SELECT * FROM missing_table');
    check('missing table -> QUERY_ERROR', s.done?.message === 'QUERY_ERROR' && /missing_table/.test(s.done.payload.error), s.done?.payload.error);

    s = await select('t5', 'nope_db', 'SELECT 1');
    check('missing database -> QUERY_ERROR', s.done?.message === 'QUERY_ERROR', s.done?.payload.error);

    s = await select('t6', 'shop', 'SELECT 1 + 1 AS two, NOW() AS now');
    check('select without FROM: columns from fields', s.columns.join(',') === 'two,now' && String(s.rows[0]?.two) === '2', s.columns.join(',') + ' ' + s.order);

    s = await select('t7', 'shop', 'SELECT status, COUNT(*) AS c FROM orders GROUP BY status');
    check('GROUP BY total counts groups', s.total === 4 && s.rows.length === 4, `total=${s.total} rows=${s.rows.length}`);

    s = await select('t8', 'shop', 'SELECT * FROM orders o JOIN customers c ON c.id = o.customer_id LIMIT 3');
    check('JOIN with duplicated column names counts', s.total === 500 && s.rows.length === 3, `total=${s.total} ${s.done?.payload.error || ''}`);

    // --- JOIN with repeated column names keeps all values
    s = await select('tj1', 'shop', 'SELECT o.id, c.id, o.created_at, c.created_at, c.email FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = 10');
    {
      const colMsg = forTab('tj1').find((m) => m.message === 'SINGLE_SELECT_COLUMN')?.payload;
      const keys = colMsg?.columns.map((c) => c.key).join(',');
      const row = s.rows[0] || {};
      check('JOIN keys unique', keys === 'o.id,c.id,o.created_at,c.created_at,email', keys);
      const direct = await select('tj1b', 'shop', 'SELECT c.id, c.created_at, c.email FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = 10');
      const ord = await select('tj1c', 'shop', 'SELECT created_at FROM orders WHERE id = 10');
      const expected = direct.rows[0] || {};
      check('JOIN values not overwritten', String(row['o.id']) === '10' && String(row['c.id']) === String(expected.id)
        && row['c.created_at'] === expected.created_at && row['o.created_at'] === ord.rows[0]?.created_at && row.email === expected.email, JSON.stringify(row));
    }
    s = await select('tj2', 'shop', 'SELECT * FROM orders o JOIN customers c ON c.id = o.customer_id ORDER BY o.id LIMIT 2');
    const columnCount = await select('tj2b', 'shop', "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = 'shop' AND TABLE_NAME IN ('orders', 'customers')");
    check('SELECT * JOIN has all columns', s.columns.length === Number(columnCount.rows[0]?.n) && s.rows[0]?.['o.id'] !== undefined && s.rows[0]?.['c.id'] !== undefined, s.columns.join(','));
    s = await select('tj3', 'shop', 'SELECT id, email, LOWER(city) AS city FROM customers WHERE id = 2');
    check('unique names keep plain keys', s.rows[0] && String(s.rows[0].id) === '2' && s.rows[0].city === 'krakow', JSON.stringify(s.rows[0]));

    // --- two tabs, different databases, at the same time (was racing on shared USE)
    const [a, b] = await Promise.all([
      select('ta', 'shop', 'SELECT COUNT(*) AS n, DATABASE() AS db FROM categories'),
      select('tb', 'blog', 'SELECT COUNT(*) AS n, DATABASE() AS db FROM authors'),
    ]);
    check('parallel tabs use own database', a.rows[0]?.db === 'shop' && b.rows[0]?.db === 'blog', `${a.rows[0]?.db}/${b.rows[0]?.db} ${a.done?.payload.error || ''}${b.done?.payload.error || ''}`);

    // --- duplicate command within 500ms is skipped
    send('SEND_SELECT_QUERY', {query: 'SELECT * FROM categories', database: {name: 'shop'}, tabId: 'dup'});
    send('SEND_SELECT_QUERY', {query: 'SELECT * FROM categories', database: {name: 'shop'}, tabId: 'dup'});
    await waitFor(() => doneTab('dup'));
    await sleep(300);
    const dupRows = forTab('dup').filter((m) => m.message === 'SINGLE_SELECT_RECORD').length;
    check('duplicate command skipped', dupRows === 5, `rows=${dupRows}`);

    ws.send('not json');
    send('UNKNOWN_COMMAND', {tabId: 'unk'});
    await waitFor(() => doneTab('unk'), 1000);
    check('unknown command -> QUERY_ERROR', doneTab('unk')?.message === 'QUERY_ERROR', doneTab('unk')?.payload.error);

    ws.close();
    await fetch(`${BASE}/api/disconnect`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token})});
  }

  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
