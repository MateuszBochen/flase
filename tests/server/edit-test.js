// Row editing end-to-end test: node edit-test.js <baseUrl>
const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://php_flase:3001';
const WS_BASE = BASE.replace('http', 'ws');

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 5000) => {
  const start = Date.now();
  while (Date.now() - start < ms) { const v = fn(); if (v) return v; await sleep(30); }
  return fn();
};
let tabSeq = 0;

(async () => {
  for (const dsn of ['mysql://mariadb', 'mysql://mysql:3306']) {
    console.log(`\n=== ${dsn}`);
    const conn = {id: 'edit-' + dsn, dsn, username: 'flase', displayName: dsn, changeConfirmationRequired: false};
    const res = await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: conn})});
    const user = await res.json();
    const ws = new WebSocket(`${WS_BASE}/ws/${user.token}`);
    const messages = [];
    ws.on('message', (m) => messages.push(JSON.parse(m)));
    await new Promise((r) => ws.on('open', r));
    const send = (command, payload) => ws.send(JSON.stringify({connectionData: {user, connection: conn}, command, payload}));
    const forTab = (tabId) => messages.filter((m) => m.payload && m.payload.tabId === tabId);
    const doneTab = (tabId, types) => forTab(tabId).find((m) => types.includes(m.message));

    const select = async (query) => {
      const tabId = 's' + (++tabSeq);
      send('SEND_SELECT_QUERY', {query, database: {name: 'shop'}, tabId});
      const done = await waitFor(() => doneTab(tabId, ['QUERY_FINISHED', 'QUERY_ERROR']));
      const colMsg = forTab(tabId).find((m) => m.message === 'SINGLE_SELECT_COLUMN')?.payload;
      return {
        done, colMsg,
        columns: colMsg?.columns || [],
        rows: forTab(tabId).filter((m) => m.message === 'SINGLE_SELECT_RECORD').map((m) => m.payload.rowDataValue),
      };
    };
    const apply = async (changes, dryRun, table = 'edit_test') => {
      const tabId = 'a' + (++tabSeq);
      send('APPLY_ROW_CHANGES', {tabId, database: {name: 'shop'}, table: {databaseName: 'shop', name: table}, changes, dryRun});
      return (await waitFor(() => doneTab(tabId, ['ROW_CHANGES_PREVIEW', 'ROW_CHANGES_APPLIED', 'QUERY_ERROR']))) || {};
    };

    // --- editability detection
    let s = await select('SELECT * FROM edit_test ORDER BY id');
    check('select *: editable with PK', s.colMsg?.editable?.primaryKey?.join() === 'id' && s.colMsg.editable.table.name === 'edit_test', JSON.stringify(s.colMsg?.editable));
    const status = s.columns.find((c) => c.name === 'status');
    check('enum values parsed', JSON.stringify(status?.enumValues) === JSON.stringify(['new', "it's done"]), JSON.stringify(status?.enumValues));
    check('column types sent', s.columns.find((c) => c.name === 'name')?.type === 'varchar(50)', s.columns.map((c) => `${c.name}:${c.type}`).join(' '));
    check('datetime stays as string', s.rows[0]?.created === '2026-01-02 03:04:05', s.rows[0]?.created);
    check('bigint without rounding', s.rows[0]?.big === '9007199254740993', String(s.rows[0]?.big));
    check('decimal exact', s.rows[0]?.price === '1.10', String(s.rows[0]?.price));

    s = await select('SELECT name, note FROM edit_test');
    check('without PK in result: read only + reason', s.colMsg?.editable === null && /primary key/i.test(s.colMsg.readOnlyReason), s.colMsg?.readOnlyReason);
    check('only selected columns are sent', s.columns.map((c) => c.name).join() === 'name,note', s.columns.map((c) => c.name).join());

    s = await select('SELECT id, name AS label, UPPER(name) AS up FROM edit_test');
    const label = s.columns.find((c) => c.name === 'label');
    const up = s.columns.find((c) => c.name === 'up');
    check('alias keeps orgName and is editable', label?.orgName === 'name' && label.editable === true, JSON.stringify({o: label?.orgName, e: label?.editable}));
    check('expression column not editable', up && up.editable === false, JSON.stringify(up));

    s = await select('SELECT * FROM orders o JOIN customers c ON c.id = o.customer_id LIMIT 1');
    check('JOIN read only', s.colMsg?.editable === null && /JOIN/.test(s.colMsg.readOnlyReason), s.colMsg?.readOnlyReason);
    s = await select('SELECT status, COUNT(*) FROM orders GROUP BY status');
    check('GROUP BY read only', s.colMsg?.editable === null, s.colMsg?.readOnlyReason);
    s = await select('SELECT * FROM edit_nopk');
    check('table without PK: editable, empty primaryKey', s.colMsg?.editable?.primaryKey?.length === 0, JSON.stringify(s.colMsg?.editable));

    // --- dry run escaping
    let r = await apply([{kind: 'update', where: {id: 1}, values: {name: "O'Reilly \\ \"q\"", note: null}}], true);
    check('dryRun returns escaped sql', r.message === 'ROW_CHANGES_PREVIEW' && r.payload.statements[0] === "UPDATE `shop`.`edit_test` SET `name` = 'O\\'Reilly \\\\ \\\"q\\\"', `note` = NULL WHERE `id` = 1", r.payload?.statements?.[0]);
    s = await select('SELECT name FROM edit_test WHERE id = 1');
    check('dryRun did not change data', s.rows[0]?.name === 'a', s.rows[0]?.name);

    r = await apply([{kind: 'update', values: {name: 'x'}}], true);
    check('update without where refused', r.message === 'QUERY_ERROR', r.payload?.error);

    // --- apply in one transaction
    r = await apply([
      {kind: 'update', where: {id: 1}, values: {name: "O'Reilly", status: "it's done", created: '2026-05-06 07:08:09'}},
      {kind: 'insert', values: {name: 'new row', note: null}},
      {kind: 'delete', where: {id: 3}},
    ], false);
    check('apply update+insert+delete', r.message === 'ROW_CHANGES_APPLIED' && r.payload.affectedRows === 3, r.payload?.error || `affected=${r.payload?.affectedRows}`);
    s = await select('SELECT id, name, status, created FROM edit_test ORDER BY id');
    const names = s.rows.map((row) => row.name).join('|');
    check('data after apply', names === "O'Reilly|b|new row", names);
    check('values stored exactly', s.rows[0]?.status === "it's done" && s.rows[0]?.created === '2026-05-06 07:08:09', JSON.stringify(s.rows[0]));

    // --- rollback when row is missing
    const before = (await select('SELECT COUNT(*) AS n FROM edit_test')).rows[0].n;
    r = await apply([
      {kind: 'insert', values: {name: 'should be rolled back'}},
      {kind: 'update', where: {id: 999}, values: {name: 'nope'}},
    ], false);
    const after = (await select('SELECT COUNT(*) AS n FROM edit_test')).rows[0].n;
    check('missing row -> error and rollback', r.message === 'QUERY_ERROR' && before === after, `${r.payload?.error} before=${before} after=${after}`);

    r = await apply([{kind: 'update', where: {id: 2}, values: {status: 'invalid'}}], false);
    check('sql error reported', r.message === 'QUERY_ERROR' && /Nothing was saved/.test(r.payload.error), r.payload?.error);

    // --- table without PK: all columns + LIMIT 1, NULL compared with IS NULL
    r = await apply([{kind: 'update', where: {a: 1, b: 'x'}, values: {b: 'y'}, limitOne: true}], false, 'edit_nopk');
    s = await select('SELECT b FROM edit_nopk WHERE a = 1 ORDER BY b');
    check('no PK update hits one of duplicates', r.message === 'ROW_CHANGES_APPLIED' && s.rows.map((x) => x.b).join() === 'x,y', r.payload?.error || s.rows.map((x) => x.b).join());
    r = await apply([{kind: 'insert', values: {}}], false, 'edit_nopk');
    check('insert with defaults only', r.message === 'ROW_CHANGES_APPLIED' && r.payload.statements[0] === 'INSERT INTO `shop`.`edit_nopk` () VALUES ()', r.payload?.error || r.payload?.statements?.[0]);
    r = await apply([{kind: 'delete', where: {a: null, b: 'n'}, limitOne: true}], false, 'edit_nopk');
    check('IS NULL where deletes row', r.message === 'ROW_CHANGES_APPLIED' && r.payload.affectedRows === 1, r.payload?.error || r.payload?.statements?.[0]);

    ws.close();
    await fetch(`${BASE}/api/disconnect`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: user.token})});
  }
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
