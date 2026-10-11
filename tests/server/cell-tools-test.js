// find and replace in column, whole binary values: node cell-tools-test.js <baseUrl>
const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://php_flase:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const connect = async (connection) => {
  const user = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws/${user.token}`);
  const messages = [];
  ws.on('message', (m) => messages.push(JSON.parse(m)));
  await new Promise((r) => ws.on('open', r));
  let seq = 0;
  const done = ['FIND_REPLACE_PREVIEW', 'FIND_REPLACE_APPLIED', 'BINARY_VALUE', 'QUERY_ERROR', 'QUERY_FINISHED'];
  const request = async (command, payload) => {
    const tabId = 'c' + (++seq);
    ws.send(JSON.stringify({connectionData: {user, connection}, command, payload: {...payload, tabId}}));
    for (let i = 0; i < 400; i++) {
      const m = messages.find((x) => x.payload?.tabId === tabId && done.includes(x.message));
      if (m) {
        await sleep(20);
        return {...m, error: m.message === 'QUERY_ERROR' ? m.payload.error : null,
          rows: messages.filter((x) => x.payload?.tabId === tabId && x.message === 'SINGLE_SELECT_RECORD').map((x) => x.payload.rowDataValue)};
      }
      await sleep(30);
    }
    return {error: 'timeout'};
  };
  return {ws, request};
};

const run = async (dsn, database, isPg) => {
  console.log(`\n=== ${dsn}`);
  const connection = {id: 'ct-' + dsn, dsn, username: 'flase', displayName: dsn, changeConfirmationRequired: false};
  const c = await connect(connection);
  const sql = (query) => c.request('SEND_SELECT_QUERY', {query, database: {name: database}});
  const table = {databaseName: database, name: 'ft_test'};
  const replace = (column, find, replaceWith, options = {}) => c.request('FIND_REPLACE', {table, column, find, replace: replaceWith, regex: false, dryRun: true, ...options});

  await sql('DROP TABLE IF EXISTS ft_test');
  await sql(`CREATE TABLE ft_test (id INT PRIMARY KEY, name VARCHAR(50), note TEXT, n INT, data ${isPg ? 'BYTEA' : 'LONGBLOB'})`);
  await sql("INSERT INTO ft_test (id, name, note, n) VALUES (1, 'Hello World', 'a1b22', 1), (2, 'hello world', 'it''s', 2), (3, 'abc', NULL, 3), (4, NULL, 'x', 4)");

  let r = await replace('name', 'World', 'Earth');
  check('preview: count and rows, case sensitive', r.message === 'FIND_REPLACE_PREVIEW' && r.payload.count === 1 && r.payload.keyColumns.join() === 'id'
    && JSON.stringify(r.payload.rows) === '[{"key":["1"],"before":"Hello World","after":"Hello Earth"}]', r.error || JSON.stringify(r.payload));
  check('preview statement', /^UPDATE .*ft_test.* SET .*name.* = (REPLACE|replace)\(/.test(r.payload?.statement || ''), r.payload?.statement);
  check('preview does not change data', (await sql("SELECT COUNT(*) AS n FROM ft_test WHERE id = 1 AND name = 'Hello World'")).rows[0]?.n == 1);
  r = await replace('name', 'hello', 'Hello');
  check('change of letter case only is found (case insensitive collation too)', r.payload?.count === 1 && r.payload.rows[0]?.key[0] === '2', r.error || JSON.stringify(r.payload));
  r = await replace('note', "'", '"');
  check('apostrophe in value', r.payload?.count === 1 && r.payload.rows[0]?.after === 'it"s', r.error || JSON.stringify(r.payload?.rows));
  r = await replace('n', '1', '2');
  check('number column refused', /text columns/.test(r.error || ''), r.error);
  r = await replace('name', '', 'x');
  check('empty find refused', /required/.test(r.error || ''), r.error);
  r = await replace('nope', 'a', 'b');
  check('unknown column refused', /does not exist/.test(r.error || ''), r.error);

  r = await replace('name', 'World', 'Earth', {dryRun: false});
  check('replaced', r.message === 'FIND_REPLACE_APPLIED' && r.payload.affected === 1, r.error || JSON.stringify(r.payload));
  check('value changed', (await sql('SELECT name FROM ft_test WHERE id = 1')).rows[0]?.name === 'Hello Earth');
  r = await replace('name', 'World', 'Earth');
  check('nothing left to replace', r.payload?.count === 0 && r.payload.rows.length === 0, JSON.stringify(r.payload));

  r = await replace('note', '[0-9]+', '#', {regex: true});
  check('regular expression preview', r.payload?.count === 1 && r.payload.rows[0]?.after === 'a#b#', r.error || JSON.stringify(r.payload?.rows));
  r = await replace('note', '[0-9]+', '#', {regex: true, dryRun: false});
  check('regular expression replaced', r.payload?.affected === 1 && (await sql('SELECT note FROM ft_test WHERE id = 1')).rows[0]?.note === 'a#b#', r.error);
  r = await replace('note', '(unclosed', 'x', {regex: true});
  check('invalid regular expression reports error', r.message === 'QUERY_ERROR', r.error);

  const ro = await connect({...connection, id: 'ct-ro-' + dsn, readOnly: true});
  r = await ro.request('FIND_REPLACE', {table, column: 'name', find: 'a', replace: 'b', regex: false, dryRun: true});
  check('read only: preview allowed', r.message === 'FIND_REPLACE_PREVIEW', r.error);
  r = await ro.request('FIND_REPLACE', {table, column: 'name', find: 'a', replace: 'b', regex: false, dryRun: false});
  check('read only: replace refused', /read only/i.test(r.error || ''), r.error);
  ro.ws.close();

  // --- whole binary value (preview of grid has 4096 bytes)
  const png = '89504e470d0a1a0a' + '00'.repeat(5000);
  await sql(isPg ? `UPDATE ft_test SET data = '\\x${png}'::bytea WHERE id = 1` : `UPDATE ft_test SET data = X'${png}' WHERE id = 1`);
  const grid = await sql('SELECT id, data FROM ft_test WHERE id = 1');
  check('grid has truncated preview', grid.rows[0]?.data?.binary === true && grid.rows[0].data.truncated === true && grid.rows[0].data.size === 5008, JSON.stringify(grid.rows[0]?.data).slice(0, 100));
  r = await c.request('GET_BINARY_VALUE', {table, column: 'data', where: {id: 1}});
  const bytes = r.payload?.base64 ? Buffer.from(r.payload.base64, 'base64') : Buffer.alloc(0);
  check('whole value with mime type', r.message === 'BINARY_VALUE' && r.payload.size === 5008 && bytes.length === 5008 && bytes.toString('hex').startsWith('89504e47') && r.payload.mimeType === 'image/png', r.error || JSON.stringify({...r.payload, base64: undefined}));
  r = await c.request('GET_BINARY_VALUE', {table, column: 'data', where: {id: 99}});
  check('missing row reported', /does not exist/.test(r.error || ''), r.error);
  r = await c.request('GET_BINARY_VALUE', {table, column: 'data', where: {}});
  check('row without identity refused', /cannot be identified/.test(r.error || ''), r.error);

  await sql('DROP TABLE ft_test');
  c.ws.close();
};

(async () => {
  await run('mysql://mariadb', 'shop', false);
  await run('mysql://mysql', 'shop', false);
  await run('postgresql://postgres:5432/shop', 'public', true);
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
