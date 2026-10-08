// SQL console, cancel, processlist: node console-test.js
const WebSocket = require('ws');
const BASE = 'http://php_flase:3001';
let failures = 0;
const check = (name, ok, info = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const dsn of ['mysql://mariadb', 'mysql://mysql']) {
    console.log(`\n=== ${dsn}`);
    const connection = {id: 'c-' + dsn, dsn, username: 'flase', displayName: dsn, changeConfirmationRequired: false};
    const user = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();
    const ws = new WebSocket(`ws://php_flase:3001/ws/${user.token}`);
    const messages = [];
    ws.on('message', (m) => messages.push(JSON.parse(m)));
    await new Promise((r) => ws.on('open', r));
    const send = (command, payload) => ws.send(JSON.stringify({connectionData: {user, connection}, command, payload}));
    let seq = 0;
    const waitFor = async (fn, ms = 15000) => { const start = Date.now(); while (Date.now() - start < ms) { const v = fn(); if (v) return v; await sleep(30); } return fn(); };

    const execute = async (statements, extra = {}) => {
      const tabId = 'con' + (++seq) + Math.random();
      send('EXECUTE_STATEMENTS', {tabId, database: null, statements, ...extra});
      const done = await waitFor(() => messages.find((m) => m.payload?.tabId === tabId && m.message === 'EXECUTION_FINISHED'));
      const finished = messages.filter((m) => m.payload?.tabId === tabId && m.message === 'STATEMENT_FINISHED').map((m) => m.payload);
      const rowsOf = (i) => messages.filter((m) => m.payload?.tabId === `${tabId}:${i}` && m.message === 'SINGLE_SELECT_RECORD').map((m) => m.payload.rowDataValue);
      const columnsOf = (i) => messages.find((m) => m.payload?.tabId === `${tabId}:${i}` && m.message === 'SINGLE_SELECT_COLUMN')?.payload;
      return {tabId, done: done?.payload, finished, rowsOf, columnsOf};
    };

    // --- one session for all statements
    let r = await execute([
      'SELECT DATABASE() AS db',
      'USE shop',
      'SELECT COUNT(*) AS n FROM customers',
      'SET @x = 5',
      'SELECT @x + 1 AS y',
      'CREATE TEMPORARY TABLE tmp_console (a INT)',
      'INSERT INTO tmp_console VALUES (1), (2), (3)',
      'UPDATE tmp_console SET a = a + 1 WHERE a < 3',
      'SELECT * FROM tmp_console ORDER BY a',
    ]);
    check('all executed', r.done?.executed === 9 && r.done.failed === 0, JSON.stringify(r.done));
    check('no database at start', r.rowsOf(0)[0]?.db === null, JSON.stringify(r.rowsOf(0)));
    check('USE changes database for next statements', String(r.rowsOf(2)[0]?.n) === '200');
    check('session variable kept', String(r.rowsOf(4)[0]?.y) === '6');
    const insert = r.finished[6].result;
    const update = r.finished[7].result;
    check('insert result', insert.kind === 'ok' && insert.affectedRows === 3, JSON.stringify(insert));
    check('update result', update.kind === 'ok' && update.affectedRows === 2 && update.changedRows === 2, JSON.stringify(update));
    check('rows result', r.finished[8].result.kind === 'rows' && r.rowsOf(8).map((x) => x.a).join() === '2,3,3', JSON.stringify(r.rowsOf(8)));
    check('console results read only', r.columnsOf(8)?.editable === null && /console/.test(r.columnsOf(8)?.readOnlyReason), JSON.stringify(r.columnsOf(8)?.readOnlyReason));
    check('durations', r.finished.every((f) => typeof f.durationMs === 'number'));

    // --- max rows
    r = await execute(['SELECT * FROM shop.orders'], {maxRows: 10});
    check('max rows: 10 sent, 500 read, truncated', r.rowsOf(0).length === 10 && r.finished[0].result.rows === 500 && r.finished[0].result.truncated === true, JSON.stringify(r.finished[0].result));
    check('columns with metadata (FK)', r.columnsOf(0)?.columns.find((c) => c.name === 'customer_id')?.reference?.table.name === 'customers');

    // --- errors
    r = await execute(['SELECT 1 AS a', 'SELEC 2', 'SELECT 3 AS c']);
    check('stop on error', r.done.executed === 1 && r.done.failed === 1 && r.done.skipped === 1 && /syntax/.test(r.finished[1].error), JSON.stringify(r.done));
    r = await execute(['SELECT 1 AS a', 'SELEC 2', 'SELECT 3 AS c'], {stopOnError: false});
    check('continue on error', r.done.executed === 2 && r.done.failed === 1 && String(r.rowsOf(2)[0]?.c) === '3', JSON.stringify(r.done));
    r = await execute(['SHOW TABLES FROM shop', 'DESCRIBE shop.orders', 'EXPLAIN SELECT * FROM shop.orders WHERE id = 5']);
    check('SHOW / DESCRIBE / EXPLAIN return rows', r.done.executed === 3 && r.rowsOf(0).length >= 10 && r.rowsOf(1).length >= 4 && r.rowsOf(2).length >= 1, `${r.rowsOf(0).length} ${r.rowsOf(1).length} ${JSON.stringify(r.rowsOf(2)[0])}`);

    // --- cancel console query
    let tabId = 'cancel' + Math.random();
    let started = Date.now();
    send('EXECUTE_STATEMENTS', {tabId, database: null, statements: ['SELECT o.id, BENCHMARK(20000000, MD5(o.id)) AS b FROM shop.orders o', 'SELECT 2 AS after_cancel']});
    await sleep(800);
    send('CANCEL_QUERY', {tabId});
    let cancelled = await waitFor(() => messages.find((m) => m.payload?.tabId === tabId && m.message === 'QUERY_CANCELLED'));
    let done = await waitFor(() => messages.find((m) => m.payload?.tabId === tabId && m.message === 'EXECUTION_FINISHED'));
    let first = messages.find((m) => m.payload?.tabId === tabId && m.message === 'STATEMENT_FINISHED');
    check('console query cancelled', cancelled?.payload.cancelled === true && Date.now() - started < 5000 && /interrupted/i.test(first?.payload.error || '') && done.payload.skipped === 1,
      `${Date.now() - started}ms ${first?.payload.error}`);
    // identical command within 500 ms is skipped as duplicate
    await sleep(600);
    send('CANCEL_QUERY', {tabId});
    cancelled = await waitFor(() => messages.filter((m) => m.payload?.tabId === tabId && m.message === 'QUERY_CANCELLED')[1]);
    check('cancel when nothing runs', cancelled?.payload.cancelled === false);

    // --- cancel data grid query
    tabId = 'grid' + Math.random();
    started = Date.now();
    send('SEND_SELECT_QUERY', {query: 'SELECT o.*, BENCHMARK(20000000, MD5(o.id)) AS b FROM orders o', database: {name: 'shop'}, tabId});
    await sleep(800);
    send('CANCEL_QUERY', {tabId});
    const gridError = await waitFor(() => messages.find((m) => m.payload?.tabId === tabId && m.message === 'QUERY_ERROR'));
    check('data grid query cancelled', /interrupted/i.test(gridError?.payload.error || '') && Date.now() - started < 5000, `${Date.now() - started}ms ${gridError?.payload.error}`);

    // --- processlist and kill
    tabId = 'long' + Math.random();
    send('EXECUTE_STATEMENTS', {tabId, database: null, statements: ['SELECT SLEEP(30) AS s']});
    await sleep(800);
    const listTab = 'pl' + Math.random();
    send('GET_PROCESSLIST', {tabId: listTab});
    const list = (await waitFor(() => messages.find((m) => m.payload?.tabId === listTab && m.message === 'PROCESSLIST')))?.payload.processes || [];
    const sleeping = list.find((p) => (p.info || '').includes('SLEEP(30)'));
    check('processlist shows running query', !!sleeping && sleeping.own === true && sleeping.user === 'flase' && list.length >= 2, JSON.stringify(sleeping));
    started = Date.now();
    send('KILL_PROCESS', {tabId: listTab, id: sleeping?.id, connection: false});
    const killed = await waitFor(() => messages.find((m) => m.payload?.tabId === listTab && m.message === 'PROCESS_KILLED'));
    done = await waitFor(() => messages.find((m) => m.payload?.tabId === tabId && m.message === 'EXECUTION_FINISHED'), 8000);
    check('kill query stops it', !!killed && !!done && Date.now() - started < 5000, `${Date.now() - started}ms`);
    send('KILL_PROCESS', {tabId: listTab, id: -1, connection: false});
    const killError = await waitFor(() => messages.find((m) => m.payload?.tabId === listTab && m.message === 'QUERY_ERROR'));
    check('invalid process id refused', /Invalid process id/.test(killError?.payload.error || ''));

    ws.close();
    await fetch(`${BASE}/api/disconnect`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: user.token})});
  }
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
