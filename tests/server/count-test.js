// Rows of grid query (SELECT_TOTAL_COUNT): rows before count, time limit with estimate, remembered count, exact count.
// node count-test.js <baseUrl>   (run with NODE_PATH pointing to server/node_modules)
// Slow count without big table: condition sleeps per row - first page (100 rows) is fast, COUNT of 500 rows takes > 3 s.
const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://php_flase:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 10000) => {
  for (const start = Date.now(); Date.now() - start < ms;) { const v = fn(); if (v) return v; await sleep(30); }
  return fn();
};

const ENGINES = [
  // SLEEP(0.008) x 500 rows = 4 s
  {dsn: 'mysql://mariadb', database: 'shop', slow: 'SELECT * FROM orders WHERE SLEEP(0.008) = 0'},
  {dsn: 'mysql://mysql:3306', database: 'shop', slow: 'SELECT * FROM orders WHERE SLEEP(0.008) = 0'},
  // correlated, so pg_sleep runs for every row
  {dsn: 'postgresql://postgres:5432/shop', database: 'public', slow: 'SELECT * FROM orders o WHERE (SELECT 1 FROM pg_sleep(0.008 + o.id * 0)) = 1'},
];

(async () => {
  for (const engine of ENGINES) {
    console.log(`\n=== ${engine.dsn}`);
    const connection = {id: 'count-' + engine.dsn, dsn: engine.dsn, username: 'flase', displayName: engine.dsn, changeConfirmationRequired: false};
    const response = await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})});
    const user = await response.json();
    check('login', !!user.token, JSON.stringify(user));
    if (!user.token) continue;
    const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws/${user.token}`);
    const messages = [];
    ws.on('message', (m) => messages.push({...JSON.parse(m), at: Date.now()}));
    await new Promise((r) => ws.on('open', r));
    const send = (command, payload) => ws.send(JSON.stringify({connectionData: {user, connection}, command, payload}));
    const database = {name: engine.database};
    let seq = 0;
    const of = (tabId, type) => messages.find((m) => m.payload?.tabId === tabId && m.message === type);

    /** select of grid - waits for its total (or error) */
    const select = async (query, extra = {}, tabId = 'c' + (++seq)) => {
      const started = Date.now();
      send('SEND_SELECT_QUERY', {query, database, tabId, ...extra});
      await waitFor(() => of(tabId, 'QUERY_ERROR') || (of(tabId, 'QUERY_FINISHED') && (extra.count === false || of(tabId, 'SELECT_TOTAL_COUNT'))), 15000);
      if (extra.count === false) await sleep(300);
      const finished = of(tabId, 'QUERY_FINISHED');
      const total = of(tabId, 'SELECT_TOTAL_COUNT');
      return {tabId, error: of(tabId, 'QUERY_ERROR')?.payload.error, finished, count: total?.payload,
        rowsMs: finished ? finished.at - started : null, totalMs: total ? total.at - started : null,
        totalAfterRows: !!(finished && total && messages.indexOf(total) > messages.indexOf(finished)),
        rows: messages.filter((m) => m.payload?.tabId === tabId && m.message === 'SINGLE_SELECT_RECORD').length};
    };

    // exact count, then remembered for paging and sorting
    let r = await select('SELECT * FROM orders LIMIT 100 OFFSET 0', {recount: true});
    check('exact count after rows', !r.error && r.count?.totalCount === 500 && !r.count.estimated && !r.count.cached && r.totalAfterRows && r.rows === 100, r.error || JSON.stringify(r.count));
    check('count time is sent', typeof r.count?.countMs === 'number', JSON.stringify(r.count));
    r = await select('SELECT * FROM orders ORDER BY id DESC LIMIT 100 OFFSET 100');
    check('next page and other sort - remembered count', r.count?.totalCount === 500 && r.count.cached === true && r.count.countMs === undefined, JSON.stringify(r.count));
    r = await select('SELECT * FROM orders LIMIT 100 OFFSET 0', {recount: true});
    check('recount (Refresh) counts again', r.count?.totalCount === 500 && !r.count.cached, JSON.stringify(r.count));

    // changes through Flase clear remembered counts
    send('EXECUTE_STATEMENTS', {tabId: 'ins' + seq, database: engine.database, statements: ["INSERT INTO customers (email, first_name, last_name, city) VALUES ('count-test@example.com', 'C', 'T', 'X')"], stopOnError: true});
    await waitFor(() => of('ins' + seq, 'EXECUTION_FINISHED'));
    r = await select('SELECT * FROM customers LIMIT 100 OFFSET 0', {recount: true});
    const customers = r.count?.totalCount;
    send('EXECUTE_STATEMENTS', {tabId: 'del' + seq, database: engine.database, statements: ["DELETE FROM customers WHERE email = 'count-test@example.com'"], stopOnError: true});
    await waitFor(() => of('del' + seq, 'EXECUTION_FINISHED'));
    r = await select('SELECT * FROM customers LIMIT 100 OFFSET 100');
    check('change of data clears remembered count', r.count?.totalCount === customers - 1 && !r.count.cached, `${customers} -> ${JSON.stringify(r.count)}`);

    // results which are not rows of table
    r = await select('SELECT MAX(id) AS m, COUNT(*) AS c FROM orders');
    check('aggregate without GROUP BY has one row', r.count?.totalCount === 1 && r.rows === 1, JSON.stringify(r.count));
    r = await select('SELECT id FROM customers WHERE id <= 3 UNION SELECT id FROM orders WHERE id <= 5');
    check('UNION counts rows of result', r.count?.totalCount === 5 && r.rows === 5, JSON.stringify(r.count) + ' rows=' + r.rows);
    r = await select('SELECT id, COUNT(*) OVER () AS n FROM orders LIMIT 10');
    check('window function keeps all rows', r.count?.totalCount === 500, JSON.stringify(r.count));

    // export of all rows is not counted
    r = await select('SELECT * FROM orders', {count: false});
    check('count: false - no count', !r.error && r.finished && !r.count, JSON.stringify(r.count));

    // slow count - rows come first, count is stopped after 3 s and estimated
    r = await select(`${engine.slow} LIMIT 100 OFFSET 0`, {recount: true});
    check('slow count: rows do not wait for count', !r.error && r.rows === 100 && r.rowsMs < 2500, r.error || `rows after ${r.rowsMs} ms`);
    check('slow count: stopped after time limit, estimated', r.count?.estimated === true && r.totalMs - r.rowsMs < 4500 && (r.count.totalCount === null || r.count.totalCount >= 0),
      `${JSON.stringify(r.count)} total after ${r.totalMs} ms`);
    const estimate = r.count?.totalCount;
    r = await select(`${engine.slow} LIMIT 100 OFFSET 100`);
    check('slow count: next page keeps estimate, does not count again', r.count?.estimated === true && r.count.cached && r.count.totalCount === estimate && r.totalMs - r.rowsMs < 500, JSON.stringify(r.count));

    // pages clicked while the first page is counted - they wait for its count, they do not count on other connections
    const sharedQuery = `${engine.slow} AND customer_id > 0`;
    const first = select(`${sharedQuery} LIMIT 100 OFFSET 0`, {recount: true}, 'shared0');
    await waitFor(() => of('shared0', 'QUERY_FINISHED'));
    const next = await Promise.all([1, 2].map((page) => select(`${sharedQuery} LIMIT 100 OFFSET ${page * 100}`, {}, `shared${page}`)));
    const shared = [await first, ...next];
    check('pages at once share one count', shared.every((x) => x.count?.estimated && x.count.totalCount === shared[0].count.totalCount)
      && !shared[0].count.cached && next.every((x) => x.count.cached), JSON.stringify(shared.map((x) => x.count)));

    // exact count on request - without time limit
    const exactTab = 'exact' + seq;
    let started = Date.now();
    send('COUNT_RECORDS', {query: `${engine.slow} LIMIT 100 OFFSET 0`, database, tabId: exactTab});
    let total = await waitFor(() => of(exactTab, 'SELECT_TOTAL_COUNT'), 15000);
    check('COUNT_RECORDS counts without time limit', total?.payload.totalCount === 500 && !total.payload.estimated && Date.now() - started >= 3000, JSON.stringify(total?.payload));
    r = await select(`${engine.slow} LIMIT 100 OFFSET 200`);
    check('exact count is remembered', r.count?.totalCount === 500 && !r.count.estimated && r.count.cached, JSON.stringify(r.count));

    // exact count can be cancelled by the grid (session of the tab)
    const cancelTab = 'cancel' + seq;
    started = Date.now();
    send('COUNT_RECORDS', {query: `${engine.slow} AND 1 = 1`, database, tabId: cancelTab});
    await sleep(700);
    send('CANCEL_QUERY', {tabId: cancelTab});
    total = await waitFor(() => of(cancelTab, 'SELECT_TOTAL_COUNT'), 10000);
    check('COUNT_RECORDS cancelled', total?.payload.totalCount === null && !!total.payload.error && Date.now() - started < 3000, JSON.stringify(total?.payload));

    // read only connection after a stopped count - session works again (time limit was reset)
    r = await select(`${engine.slow} LIMIT 600 OFFSET 0`, {recount: true, count: false});
    check('time limit does not stay on connection', !r.error && r.rows === 500, r.error || `rows=${r.rows}`);

    ws.close();
    await fetch(`${BASE}/api/disconnect`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: user.token})});
  }
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
