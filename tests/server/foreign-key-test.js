// add / drop of foreign keys, constraint names in column references: node foreign-key-test.js <baseUrl>
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
  const done = ['STRUCTURE_CHANGE_PREVIEW', 'STRUCTURE_CHANGE_APPLIED', 'TABLE_STRUCTURE', 'QUERY_ERROR', 'QUERY_FINISHED'];
  const request = async (command, payload) => {
    const tabId = 'f' + (++seq);
    ws.send(JSON.stringify({connectionData: {user, connection}, command, payload: {...payload, tabId}}));
    for (let i = 0; i < 400; i++) {
      const m = messages.find((x) => x.payload?.tabId === tabId && done.includes(x.message));
      if (m) return {...m, error: m.message === 'QUERY_ERROR' ? m.payload.error : null};
      await sleep(30);
    }
    return {error: 'timeout'};
  };
  const tables = async (database) => {
    const start = messages.length;
    ws.send(JSON.stringify({connectionData: {user, connection}, command: 'RELOAD_TABLES_LIST', payload: {name: database}}));
    await sleep(1500);
    const items = new Map();
    messages.slice(start).filter((m) => m.message === 'TABLE_BASE_ITEM' && !m.payload.preload).forEach((m) => items.set(m.payload.tableName, m.payload));
    return items;
  };
  return {ws, request, tables};
};

const run = async (dsn, database, quote) => {
  console.log(`\n=== ${dsn}`);
  const connection = {id: 'fk-' + dsn, dsn, username: 'flase', displayName: dsn, changeConfirmationRequired: false};
  const c = await connect(connection);
  const sql = (query) => c.request('SEND_SELECT_QUERY', {query, database: {name: database}});
  const alter = (table, operations, dryRun = false) => c.request('CHANGE_STRUCTURE', {table: {databaseName: database, name: table}, change: {kind: 'alter', operations}, dryRun});
  const q = (name) => `${quote}${name}${quote}`;

  await sql('DROP TABLE IF EXISTS fk_child');
  await sql('DROP TABLE IF EXISTS fk_parent');
  await sql('CREATE TABLE fk_parent (id INT PRIMARY KEY, code INT NOT NULL, UNIQUE (id, code))');
  await sql('CREATE TABLE fk_child (id INT PRIMARY KEY, parent_id INT, parent_code INT)');

  const add = {
    op: 'addForeignKey', name: 'fk_child_parent', columns: ['parent_id', 'parent_code'],
    referencedTable: {databaseName: database, name: 'fk_parent'}, referencedColumns: ['id', 'code'], onDelete: 'cascade', onUpdate: 'RESTRICT',
  };
  let r = await alter('fk_child', [add], true);
  const expected = `ADD CONSTRAINT ${q('fk_child_parent')} FOREIGN KEY (${q('parent_id')}, ${q('parent_code')}) REFERENCES ${q(database)}.${q('fk_parent')} (${q('id')}, ${q('code')}) ON DELETE CASCADE ON UPDATE RESTRICT`;
  check('add foreign key preview', r.payload?.statements?.[0]?.endsWith(expected), r.error || r.payload?.statements?.[0]);
  r = await alter('fk_child', [{...add, onDelete: 'DROP TABLE x'}], true);
  check('invalid action refused', /Invalid ON DELETE action/.test(r.error || ''), r.error);
  r = await alter('fk_child', [{...add, referencedColumns: ['id']}], true);
  check('different count of columns refused', /same number/.test(r.error || ''), r.error);
  r = await alter('fk_child', [add]);
  check('foreign key added', r.message === 'STRUCTURE_CHANGE_APPLIED', r.error);
  r = await c.request('GET_TABLE_STRUCTURE', {table: {databaseName: database, name: 'fk_child'}});
  const key = r.payload?.foreignKeys?.[0];
  check('structure shows foreign key', key?.name === 'fk_child_parent' && key.columns.join() === 'parent_id,parent_code' && key.onDelete === 'CASCADE', JSON.stringify(key));

  r = await alter('fk_child', [{...add, name: '', columns: ['parent_id'], referencedColumns: ['id'], onDelete: 'SET NULL', onUpdate: 'NO ACTION'}]);
  check('unnamed foreign key added', r.message === 'STRUCTURE_CHANGE_APPLIED' && !/CONSTRAINT/.test(r.payload.statements[0]), r.error || r.payload?.statements?.[0]);
  const items = await c.tables(database);
  const reference = items.get('fk_child')?.columns.find((column) => column.name === 'parent_id')?.reference;
  check('column reference has constraint name', !!reference?.constraintName && reference.table.name === 'fk_parent', JSON.stringify(reference));
  await sql('INSERT INTO fk_parent VALUES (1, 10)');
  r = await sql('INSERT INTO fk_child VALUES (1, 2, 20)');
  check('foreign key is enforced', r.message === 'QUERY_ERROR', r.error);

  r = await alter('fk_child', [{op: 'dropForeignKey', name: 'fk_child_parent'}], true);
  check('drop preview', r.payload?.statements?.[0]?.endsWith(quote === '`' ? 'DROP FOREIGN KEY `fk_child_parent`' : 'DROP CONSTRAINT "fk_child_parent"'), r.error || r.payload?.statements?.[0]);
  r = await alter('fk_child', [{op: 'dropForeignKey', name: 'fk_child_parent'}]);
  const left = (await c.request('GET_TABLE_STRUCTURE', {table: {databaseName: database, name: 'fk_child'}})).payload?.foreignKeys || [];
  check('foreign key dropped, other one stays', r.message === 'STRUCTURE_CHANGE_APPLIED' && left.length === 1 && left[0].columns.join() === 'parent_id', r.error || JSON.stringify(left));

  await sql('DROP TABLE fk_child');
  await sql('DROP TABLE fk_parent');
  c.ws.close();
};

(async () => {
  await run('mysql://mariadb', 'shop', '`');
  await run('mysql://mysql', 'shop', '`');
  await run('postgresql://postgres:5432/shop', 'public', '"');
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
