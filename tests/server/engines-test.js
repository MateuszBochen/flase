// Main features of Flase on compatible engines (TiDB, CockroachDB...) - every DSN gets the same checks:
// node engines-test.js <baseUrl> <dsn> [<dsn> ...]   (user flase / flase, database shop)
const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://php_flase:3001';
const DSNS = process.argv.slice(3);

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const col = (name, type, extra = {}) => ({
  name, type, nullable: true, defaultValue: {kind: 'none'}, autoIncrement: false, onUpdateCurrentTimestamp: false, comment: '', collation: null, ...extra,
});

const connect = async (connection) => {
  const response = await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})});
  const user = await response.json();
  if (!user.token) return {error: user.error || response.status};
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws/${user.token}`);
  const messages = [];
  ws.on('message', (m) => messages.push(JSON.parse(m)));
  await new Promise((r) => ws.on('open', r));
  let seq = 0;
  const send = (command, payload) => ws.send(JSON.stringify({connectionData: {user, connection}, command, payload}));
  /** first message of the tab with one of the types (or error) */
  const request = async (command, payload, done, ms = 20000) => {
    const tabId = 'e' + (++seq);
    send(command, {...payload, tabId});
    for (let start = Date.now(); Date.now() - start < ms;) {
      const m = messages.find((x) => x.payload?.tabId === tabId && [...done, 'QUERY_ERROR'].includes(x.message));
      if (m) {
        await sleep(30);
        return {...m, tabId, error: m.message === 'QUERY_ERROR' ? m.payload.error : null,
          rows: messages.filter((x) => x.payload?.tabId === tabId && x.message === 'SINGLE_SELECT_RECORD').map((x) => x.payload.rowDataValue)};
      }
      await sleep(30);
    }
    return {tabId, error: 'timeout', rows: []};
  };
  const sql = async (statements, database) => {
    const r = await request('EXECUTE_STATEMENTS', {database, statements, stopOnError: false}, ['EXECUTION_FINISHED']);
    const finished = messages.filter((m) => m.payload?.tabId === r.tabId && m.message === 'STATEMENT_FINISHED').map((m) => m.payload);
    return {errors: finished.filter((f) => f.error).map((f) => f.error), rows: (i) => messages.filter((m) => m.payload?.tabId === `${r.tabId}:${i}` && m.message === 'SINGLE_SELECT_RECORD').map((m) => m.payload.rowDataValue)};
  };
  return {user, ws, messages, send, request, sql};
};

(async () => {
  for (const dsn of DSNS) {
    console.log(`\n=== ${dsn}`);
    const postgres = /^(postgres|pgsql|cockroach|yugabyte)/.test(dsn);
    const database = postgres ? 'public' : 'shop';
    const connection = {id: 'eng-' + dsn, dsn, username: 'flase', displayName: dsn, changeConfirmationRequired: false};
    const c = await connect(connection);
    check('login', !c.error, c.error);
    if (c.error) continue;
    const q = (name) => postgres ? `"${name}"` : `\`${name}\``;

    // databases and tables
    c.send('RELOAD_DATABASE_LIST', {});
    await sleep(1500);
    const databases = c.messages.filter((m) => m.message === 'DATABASE_BASE_ITEM').map((m) => m.payload?.name ?? m.payload?.databaseName);
    check('database list', databases.length > 0, JSON.stringify(c.messages.filter((m) => m.message === 'QUERY_ERROR').map((m) => m.payload.error)));

    let r = await c.sql([`DROP TABLE IF EXISTS ${q('eng_child')}`, `DROP TABLE IF EXISTS ${q('eng_test')}`,
      postgres
        ? 'CREATE TABLE "eng_test" (id serial PRIMARY KEY, name varchar(50) NOT NULL, price numeric(10,2), created timestamp DEFAULT now(), data jsonb)'
        : 'CREATE TABLE `eng_test` (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50) NOT NULL, price DECIMAL(10,2), created DATETIME DEFAULT CURRENT_TIMESTAMP, data JSON)',
      `CREATE TABLE ${q('eng_child')} (id INT PRIMARY KEY, test_id INT REFERENCES ${q('eng_test')} (id))`,
      `INSERT INTO ${q('eng_test')} (name, price) VALUES ('a', 1.10), ('b', NULL), ('c', 3)`,
      `SELECT id FROM ${q('eng_test')} ORDER BY name`], database);
    check('console: DDL, INSERT, SELECT', r.errors.length === 0 && r.rows(5).length === 3, r.errors.join(' | '));
    const ids = r.rows(5).map((row) => row.id);

    c.send('RELOAD_TABLES_LIST', {name: database});
    await sleep(1500);
    const tables = c.messages.filter((m) => m.message === 'TABLE_BASE_ITEM').map((m) => m.payload?.tableName ?? m.payload?.name);
    check('table list', tables.includes('eng_test'), JSON.stringify(tables).slice(0, 200));

    r = await c.request('GET_TABLE_STRUCTURE', {table: {databaseName: database, name: 'eng_test'}}, ['TABLE_STRUCTURE']);
    check('table structure', !r.error && r.payload.columns?.length === 5 && /CREATE TABLE/i.test(r.payload.ddl || ''), r.error || JSON.stringify(r.payload?.columns?.map((x) => x.name)));
    check('foreign key of child', !r.error, r.error);

    // grid
    r = await c.request('SEND_SELECT_QUERY', {query: postgres ? 'SELECT * FROM "eng_test" ORDER BY id LIMIT 100 OFFSET 0' : 'SELECT * FROM `eng_test` WHERE 1 ORDER BY id LIMIT 0, 100', database: {name: database}}, ['QUERY_FINISHED']);
    await sleep(500);
    const column = c.messages.find((m) => m.payload?.tabId === r.tabId && m.message === 'SINGLE_SELECT_COLUMN')?.payload;
    const total = c.messages.find((m) => m.payload?.tabId === r.tabId && m.message === 'SELECT_TOTAL_COUNT')?.payload;
    check('grid: rows, editable, count', !r.error && r.rows.length === 3 && !!column?.editable && Number(total?.totalCount) === 3, r.error || JSON.stringify({editable: column?.editable, reason: column?.readOnlyReason, total}));

    r = await c.request('APPLY_ROW_CHANGES', {database: {name: database}, table: {databaseName: database, name: 'eng_test'}, dryRun: false,
      changes: [{kind: 'update', where: {id: ids[0]}, values: {name: "it's"}}, {kind: 'insert', values: {name: 'd', price: '4.40'}}, {kind: 'delete', where: {id: ids[2]}}]},
    ['ROW_CHANGES_APPLIED']);
    r = r.error ? r : {...r, check: await c.sql([`SELECT name FROM ${q('eng_test')} ORDER BY name`], database)};
    check('grid: update, insert, delete', !r.error && JSON.stringify(r.check.rows(0).map((x) => x.name)) === JSON.stringify(['b', 'd', "it's"]), r.error || JSON.stringify(r.check?.rows(0)));

    // structure change
    r = await c.request('CHANGE_STRUCTURE', {table: {databaseName: database, name: 'eng_test'}, dryRun: false,
      change: {kind: 'alter', operations: [{op: 'addColumn', column: col('note', 'varchar(20)'), position: {kind: 'end'}}]}}, ['STRUCTURE_CHANGE_APPLIED']);
    check('structure: add column', !r.error, r.error);
    r = await c.request('CHANGE_STRUCTURE', {table: {databaseName: database, name: 'eng_test'}, dryRun: false,
      change: {kind: 'alter', operations: [{op: 'addIndex', name: 'idx_eng_name', kind: 'INDEX', columns: [{name: 'name', length: null}]}]}}, ['STRUCTURE_CHANGE_APPLIED']);
    check('structure: add index', !r.error, r.error);

    // database overview, search, server
    r = await c.request('GET_DATABASE_OBJECTS', {database}, ['DATABASE_OBJECTS']);
    check('database objects', !r.error && r.payload.tables?.some((t) => t.name === 'eng_test'), r.error);
    c.send('SEARCH_DATABASE', {tabId: 'search', database: {name: database}, term: 'it', mode: 'contains'});
    await sleep(2500);
    const searchError = c.messages.find((m) => m.payload?.tabId === 'search' && m.message === 'QUERY_ERROR');
    check('search', !searchError && c.messages.some((m) => m.payload?.tabId === 'search' && m.message === 'DATABASE_SEARCH_FINISHED'), searchError?.payload.error);
    for (const [command, done] of [['GET_SERVER_INFO', 'SERVER_INFO'], ['GET_SERVER_STATUS', 'SERVER_STATUS'], ['GET_SERVER_VARIABLES', 'SERVER_VARIABLES'],
      ['GET_PROCESSLIST', 'PROCESSLIST'], ['GET_USERS', 'USERS'], ['GET_SERVER_OPTIONS', 'SERVER_OPTIONS']]) {
      r = await c.request(command, {}, [done]);
      check(`server: ${command}`, !r.error, r.error);
      if (command === 'GET_SERVER_STATUS') console.log(`      server: ${r.payload?.product} ${r.payload?.version}`);
    }

    // dump and import (round trip into the same database)
    const tabId = 'dump';
    c.send('CREATE_TRANSFER', {tabId, transfer: {kind: 'dump', gzip: false, options: {database, tables: ['eng_test', 'eng_child'], structure: true, data: true, dropTables: true, createDatabase: false, views: true, triggers: true}}});
    await sleep(800);
    const ticket = c.messages.find((m) => m.payload?.tabId === tabId && m.message === 'TRANSFER_TICKET')?.payload.ticket;
    const dump = ticket ? await (await fetch(`${BASE}/api/transfer/${ticket}`)).text() : '';
    await sleep(300);
    const dumped = c.messages.find((m) => m.payload?.tabId === tabId && m.message === 'DUMP_FINISHED')?.payload;
    check('dump', !!dumped && !dumped.error && dump.includes('eng_test'), dumped?.error || c.messages.find((m) => m.payload?.tabId === tabId && m.message === 'QUERY_ERROR')?.payload.error);
    c.send('CREATE_TRANSFER', {tabId: 'imp', transfer: {kind: 'import-sql', database, gzip: false, stopOnError: true, fileName: 'd.sql'}});
    await sleep(800);
    const importTicket = c.messages.find((m) => m.payload?.tabId === 'imp' && m.message === 'TRANSFER_TICKET')?.payload.ticket;
    const imported = importTicket ? await (await fetch(`${BASE}/api/transfer/${importTicket}`, {method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body: dump})).json() : {failed: true, errors: [{error: 'no ticket'}]};
    r = await c.sql([`SELECT COUNT(*) AS n FROM ${q('eng_test')}`], database);
    check('import of dump', !imported.failed && String(r.rows(0)[0]?.n) === '3', JSON.stringify(imported.errors || imported).slice(0, 300));

    await c.sql([`DROP TABLE IF EXISTS ${q('eng_child')}`, `DROP TABLE IF EXISTS ${q('eng_test')}`], database);
    c.ws.close();
    await fetch(`${BASE}/api/disconnect`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: c.user.token})});
  }
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
