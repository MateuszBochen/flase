// PostgreSQL driver: node pg-test.js
const WebSocket = require('ws');
const BASE = 'http://php_flase:3001';
let failures = 0;
const check = (name, ok, info = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const dsn = 'postgresql://postgres:5432/shop';
  const connection = {id: 't-pg', dsn, username: 'flase', displayName: 'pg', changeConfirmationRequired: false};
  const login = async (password) => fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password}, connectionData: connection})});
  const bad = await login('wrong');
  check('wrong password rejected', bad.status === 401 && /password authentication failed/.test((await bad.json()).error));
  const user = await (await login('flase')).json();
  const maria = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: {...connection, id: 't-maria', dsn: 'mariadb://mariadb:3306'}})})).json();
  check('mariadb:// DSN uses MySQL driver', !!maria.token, JSON.stringify(maria));
  check('login', !!user.token, JSON.stringify(user));
  const ws = new WebSocket(`ws://php_flase:3001/ws/${user.token}`);
  const messages = [];
  ws.on('message', (m) => messages.push(JSON.parse(m)));
  await new Promise((r) => ws.on('open', r));
  const send = (command, payload) => ws.send(JSON.stringify({connectionData: {user, connection}, command, payload}));
  const waitFor = async (fn, ms = 20000) => { const start = Date.now(); while (Date.now() - start < ms) { const v = fn(); if (v) return v; await sleep(30); } return fn(); };
  let seq = 0;
  const forTab = (tabId) => messages.filter((m) => m.payload?.tabId === tabId);
  const request = async (command, payload, done) => {
    const tabId = 'p' + (++seq);
    send(command, {...payload, tabId});
    const m = await waitFor(() => forTab(tabId).find((x) => [...done, 'QUERY_ERROR'].includes(x.message)));
    return {...(m || {}), tabId, all: forTab(tabId)};
  };
  const select = async (query, database = 'public') => {
    const r = await request('SEND_SELECT_QUERY', {query, database: {name: database}}, ['QUERY_FINISHED']);
    await sleep(50);
    const all = forTab(r.tabId);
    const colMsg = all.find((m) => m.message === 'SINGLE_SELECT_COLUMN')?.payload;
    return {error: r.message === 'QUERY_ERROR' ? r.payload.error : null, colMsg, columns: colMsg?.columns || [],
      total: all.find((m) => m.message === 'SELECT_TOTAL_COUNT')?.payload.totalCount,
      rows: all.filter((m) => m.message === 'SINGLE_SELECT_RECORD').map((m) => m.payload.rowDataValue)};
  };
  const sql = async (statements, database = 'public', extra = {}) => {
    const r = await request('EXECUTE_STATEMENTS', {database, statements, stopOnError: false, ...extra}, ['EXECUTION_FINISHED']);
    const finished = forTab(r.tabId).filter((m) => m.message === 'STATEMENT_FINISHED').map((m) => m.payload);
    return {finished, errors: finished.filter((f) => f.error).map((f) => f.error),
      rows: (i) => messages.filter((m) => m.payload?.tabId === `${r.tabId}:${i}` && m.message === 'SINGLE_SELECT_RECORD').map((m) => m.payload.rowDataValue),
      columns: (i) => messages.find((m) => m.payload?.tabId === `${r.tabId}:${i}` && m.message === 'SINGLE_SELECT_COLUMN')?.payload.columns || []};
  };
  const apply = async (changes, table = 'edit_test', dryRun = false) => request('APPLY_ROW_CHANGES', {database: {name: 'public'}, table: {databaseName: 'public', name: table}, changes, dryRun}, ['ROW_CHANGES_PREVIEW', 'ROW_CHANGES_APPLIED']);
  const structure = async (name, schema = 'public') => (await request('GET_TABLE_STRUCTURE', {table: {databaseName: schema, name}}, ['TABLE_STRUCTURE'])).payload;
  const change = (name, changeData, dryRun = false) => request('CHANGE_STRUCTURE', {table: {databaseName: 'public', name}, change: changeData, dryRun}, ['STRUCTURE_CHANGE_PREVIEW', 'STRUCTURE_CHANGE_APPLIED']);
  const alter = (name, operations, dryRun = false) => change(name, {kind: 'alter', operations}, dryRun);

  // --- schemas and tables
  send('RELOAD_DATABASE_LIST', null);
  await sleep(800);
  const schemas = messages.filter((m) => m.message === 'DATABASE_BASE_ITEM').map((m) => m.payload.name);
  check('schemas listed, system schemas last', schemas[0] === 'blog' && schemas[1] === 'public' && schemas.includes('pg_catalog') && !schemas.some((s) => s.startsWith('pg_toast')), schemas.join());
  send('RELOAD_TABLES_LIST', {name: 'public'});
  await sleep(1500);
  const tables = messages.filter((m) => m.message === 'TABLE_BASE_ITEM' && m.payload.dataBaseName === 'public' && !m.payload.preload).map((m) => m.payload);
  const editTable = tables.find((t) => t.tableName === 'edit_test');
  check('tables listed with views', tables.some((t) => t.tableName === 'struct_view') && tables.some((t) => t.tableName === 'orders'), tables.map((t) => t.tableName).join());
  check('columns with types and primary key', editTable && editTable.primaryColumns.map((c) => c.name).join() === 'id' && editTable.columns.map((c) => `${c.name}:${c.type}`).join(' ') === 'id:integer name:varchar(50) status:edit_status note:text created:timestamp big:bigint price:numeric(10,2)', editTable?.columns.map((c) => `${c.name}:${c.type}`).join(' '));
  check('enum values', JSON.stringify(editTable?.columns.find((c) => c.name === 'status').enumValues) === JSON.stringify(['new', "it's done"]));
  check('serial is auto increment, default literal parsed', editTable?.columns[0].autoIncrement && editTable.columns.find((c) => c.name === 'status').defaultValue === 'new');
  const structTable = tables.find((t) => t.tableName === 'struct_test');
  check('identity auto increment, generated not editable, reference', structTable?.columns[0].autoIncrement && structTable.columns.find((c) => c.name === 'total_x2').editable === false
    && structTable.columns.find((c) => c.name === 'customer_id').reference?.table.name === 'customers', JSON.stringify(structTable?.columns.find((c) => c.name === 'customer_id')));

  // --- select
  let s = await select('SELECT * FROM edit_test ORDER BY id LIMIT 100 OFFSET 0');
  check('select rows and total', !s.error && s.rows.length === 3 && s.total === 3, s.error || JSON.stringify(s.rows[0]));
  check('editable by primary key', s.colMsg?.editable?.primaryKey.join() === 'id' && s.colMsg.editable.table.databaseName === 'public', JSON.stringify(s.colMsg?.editable));
  check('values as in database', s.rows[0]?.created === '2026-01-02 03:04:05' && s.rows[0].big === '9007199254740993' && s.rows[0].price === '1.10' && s.rows[0].id === 1 && s.rows[0].status === 'new', JSON.stringify(s.rows[0]));
  s = await select('SELECT * FROM value_test ORDER BY id');
  check('bytea as binary, json as text, bool, array', s.rows[0]?.data?.binary && s.rows[0].data.text === 'plain text in blob' && s.rows[1].data.size === 2400
    && JSON.parse(s.rows[0].doc).address.city === 'Krakow' && s.rows[0].flag === 'true' && s.rows[1].flag === 'false' && s.rows[0].tags === '{x,y}', JSON.stringify(s.rows[0]).slice(0, 300));
  check('bytea column not editable', s.columns.find((c) => c.name === 'data')?.editable === false && s.columns.find((c) => c.name === 'doc')?.editable === true);
  s = await select('SELECT o.id, c.id, c.last_name FROM orders o JOIN customers c ON c.id = o.customer_id ORDER BY o.id LIMIT 3');
  check('join: repeated names get alias keys, read only', s.columns.map((c) => c.key).join() === 'o.id,c.id,last_name' && !s.colMsg.editable && /JOIN/.test(s.colMsg.readOnlyReason), s.columns.map((c) => c.key).join() + ' ' + s.colMsg?.readOnlyReason);
  s = await select('SELECT status, count(*) FROM orders GROUP BY status');
  check('grouped result counted by groups', s.total === s.rows.length && s.rows.length > 0, `${s.total} ${s.rows.length}`);
  s = await select("SELECT * FROM edit_test WHERE name ~ '^[ab]' ORDER BY id");
  check('postgres operators work, total counted', s.rows.length === 2 && s.total === 2, s.error || s.total);
  s = await select('SELECT * FROM posts LIMIT 1', 'blog');
  check('schema = search_path', !s.error && s.rows.length === 1 && s.columns[0].table.databaseName === 'blog', s.error);
  s = await select('SELECT * FROM no_such');
  check('sql error with position', /relation "no_such" does not exist/.test(s.error), s.error);

  // --- row edits
  let r = await apply([{kind: 'update', where: {id: 2}, values: {note: "it's \\ new", status: "it's done"}}], 'edit_test', true);
  check('update preview', r.message === 'ROW_CHANGES_PREVIEW' && r.payload.statements[0] === `UPDATE "public"."edit_test" SET "note" = E'it''s \\\\ new', "status" = 'it''s done' WHERE "id" = 2`, JSON.stringify(r.payload));
  r = await apply([{kind: 'update', where: {id: 2}, values: {note: "it's \\ new", status: "it's done"}}, {kind: 'insert', values: {name: 'd', big: '9223372036854775807'}}]);
  s = await select('SELECT * FROM edit_test ORDER BY id');
  check('update + insert applied', r.message === 'ROW_CHANGES_APPLIED' && s.rows[1].note === "it's \\ new" && s.rows[1].status === "it's done" && s.rows[3]?.big === '9223372036854775807' && s.rows[3].id === 4, JSON.stringify(r.payload) + JSON.stringify(s.rows[3]));
  r = await apply([{kind: 'insert', values: {}}], 'value_test');
  check('insert with defaults only', r.message === 'ROW_CHANGES_APPLIED', JSON.stringify(r.payload));
  r = await apply([{kind: 'update', where: {id: 99}, values: {name: 'x'}}]);
  check('missing row rolls back', r.message === 'QUERY_ERROR' && /Expected 1 row, matched 0/.test(r.payload.error), JSON.stringify(r.payload));
  r = await apply([{kind: 'delete', where: {id: 4}}]);
  check('delete', r.message === 'ROW_CHANGES_APPLIED');
  r = await apply([{kind: 'update', where: {a: 1, b: 'x'}, values: {b: 'y'}, limitOne: true}], 'edit_nopk');
  s = await select('SELECT * FROM edit_nopk ORDER BY b');
  check('table without primary key: only one of duplicates changed (ctid)', r.message === 'ROW_CHANGES_APPLIED' && s.rows.map((x) => x.b).join() === 'n,x,y', JSON.stringify(r.payload) + s.rows.map((x) => x.b).join());
  r = await apply([{kind: 'delete', where: {a: null, b: 'n'}, limitOne: true}], 'edit_nopk');
  check('NULL compared with IS NULL', r.message === 'ROW_CHANGES_APPLIED', JSON.stringify(r.payload));
  s = await select('SELECT * FROM value_test ORDER BY id');
  r = await apply([{kind: 'update', where: {id: 1, doc: s.rows[0].doc}, values: {doc: '{"a": 1}'}}], 'value_test');
  check('json column in WHERE', r.message === 'ROW_CHANGES_APPLIED', JSON.stringify(r.payload));

  // --- structure
  let st = await structure('struct_test');
  const col = (name) => st.columns.find((c) => c.name === name);
  check('structure info', st.info.type === 'BASE TABLE' && st.info.comment === 'structure test', JSON.stringify(st.info));
  check('structure columns', col('id').extra === 'identity by default' && col('id').key === 'PRI' && col('code').key === 'UNI' && col('code').comment === 'business code'
    && col('title').defaultValue === "it's untitled" && !col('title').defaultIsExpression && col('created').defaultIsExpression && col('created').defaultValue === 'now()'
    && col('total_x2').generationExpression && col('status').defaultValue === 'a', JSON.stringify(st.columns.map((c) => [c.name, c.type, c.defaultValue, c.defaultIsExpression, c.extra, c.key])));
  check('structure indexes', st.indexes.map((i) => `${i.name}:${i.primary}:${i.unique}:${i.columns.map((c) => c.name).join('+')}`).join(' ') === 'struct_test_pkey:true:true:id idx_title_status:false:false:title+status uq_code:false:true:code', st.indexes.map((i) => `${i.name}:${i.primary}:${i.unique}:${i.columns.map((c) => c.name).join('+')}`).join(' '));
  check('foreign keys both sides', st.foreignKeys[0]?.referencedTable.name === 'customers' && st.foreignKeys[0].onDelete === 'SET NULL' && st.foreignKeys[0].onUpdate === 'CASCADE'
    && st.referencedBy[0]?.table.name === 'struct_child', JSON.stringify([st.foreignKeys, st.referencedBy]));
  check('triggers', st.triggers[0]?.name === 'trg_struct_code' && st.triggers[0].timing === 'BEFORE' && st.triggers[0].event === 'INSERT', JSON.stringify(st.triggers));
  check('ddl', /^CREATE TABLE "struct_test" \(\n  "id" integer GENERATED BY DEFAULT AS IDENTITY NOT NULL,/.test(st.ddl) && st.ddl.includes('CONSTRAINT "struct_test_customer_id_fkey" FOREIGN KEY')
    && st.ddl.includes('CREATE INDEX idx_title_status ON') && st.ddl.includes("COMMENT ON COLUMN \"struct_test\".\"code\" IS 'business code'") && st.ddl.includes('GENERATED ALWAYS AS ((total * 2::numeric)) STORED') === false, st.ddl);
  const view = await structure('struct_view');
  check('view structure', view.info.type === 'VIEW' && /^CREATE OR REPLACE VIEW "struct_view" AS\nSELECT id,\n    code\n   FROM struct_test$/.test(view.ddl) && view.columns.length === 2, view.ddl);

  // --- DDL
  const definition = (name, type, extra = {}) => ({name, type, nullable: true, defaultValue: {kind: 'none'}, autoIncrement: false, onUpdateCurrentTimestamp: false, comment: '', collation: null, ...extra});
  r = await alter('struct_test', [{op: 'addColumn', column: definition('extra', 'varchar(30)', {nullable: false, defaultValue: {kind: 'value', value: "it's"}, comment: 'note'}), position: {kind: 'end'}}], true);
  check('add column preview', JSON.stringify(r.payload?.statements) === JSON.stringify([`ALTER TABLE "public"."struct_test"\n  ADD COLUMN "extra" varchar(30) DEFAULT 'it''s' NOT NULL`, `COMMENT ON COLUMN "public"."struct_test"."extra" IS 'note'`]), JSON.stringify(r.payload));
  r = await alter('struct_test', [{op: 'addColumn', column: definition('extra', 'varchar(30)'), position: {kind: 'first'}}], true);
  check('position is not supported', r.message === 'QUERY_ERROR' && /at the end/.test(r.payload.error));
  r = await alter('struct_test', [{op: 'addColumn', column: definition('extra', 'varchar(30)', {nullable: false, defaultValue: {kind: 'value', value: "it's"}, comment: 'note'}), position: {kind: 'end'}}]);
  check('add column', r.message === 'STRUCTURE_CHANGE_APPLIED', JSON.stringify(r.payload));
  r = await alter('struct_test', [{op: 'changeColumn', name: 'extra', column: definition('extra2', 'varchar(40)', {nullable: true, defaultValue: {kind: 'expression', value: "upper('x')"}, comment: 'note'}), position: {kind: 'end'}}], true);
  check('change column = difference', JSON.stringify(r.payload?.statements) === JSON.stringify([`ALTER TABLE "public"."struct_test"\n  ALTER COLUMN "extra" TYPE varchar(40) USING "extra"::varchar(40),\n  ALTER COLUMN "extra" DROP NOT NULL,\n  ALTER COLUMN "extra" SET DEFAULT upper('x')`, `ALTER TABLE "public"."struct_test" RENAME COLUMN "extra" TO "extra2"`]), JSON.stringify(r.payload));
  r = await alter('struct_test', [{op: 'changeColumn', name: 'extra', column: definition('extra2', 'varchar(40)', {nullable: true, defaultValue: {kind: 'expression', value: "upper('x')"}, comment: 'note'}), position: {kind: 'end'}}]);
  st = await structure('struct_test');
  check('change column applied', r.message === 'STRUCTURE_CHANGE_APPLIED' && col('extra2')?.type === 'varchar(40)' && col('extra2').nullable && col('extra2').defaultValue === "upper('x'::text)" && col('extra2').comment === 'note', JSON.stringify(col('extra2')));
  r = await alter('struct_test', [{op: 'changeColumn', name: 'extra2', column: definition('extra2', 'varchar(40)', {defaultValue: {kind: 'expression', value: "upper('x'::text)"}, comment: 'note'}), position: {kind: 'end'}}], true);
  check('unchanged column = nothing to change', r.message === 'QUERY_ERROR' && /Nothing to change/.test(r.payload.error), JSON.stringify(r.payload));
  r = await alter('struct_test', [{op: 'changeColumn', name: 'extra2', column: definition('extra2', 'integer', {defaultValue: {kind: 'none'}, comment: 'note'}), position: {kind: 'end'}}]);
  check('failed DDL changes nothing', r.message === 'QUERY_ERROR' && /invalid input syntax for type integer/.test(r.payload.error), JSON.stringify(r.payload));
  st = await structure('struct_test');
  check('default kept after failed DDL (transaction)', col('extra2').defaultValue === "upper('x'::text)", JSON.stringify(col('extra2')));
  r = await alter('struct_test', [{op: 'addIndex', name: 'idx_extra', kind: 'UNIQUE', columns: [{name: 'extra2', length: null}, {name: 'code', length: null}]}]);
  st = await structure('struct_test');
  check('add unique index', r.message === 'STRUCTURE_CHANGE_APPLIED' && st.indexes.some((i) => i.name === 'idx_extra' && i.unique && i.columns.length === 2), JSON.stringify(r.payload));
  r = await alter('struct_test', [{op: 'addIndex', name: '', kind: 'FULLTEXT', columns: [{name: 'title', length: null}]}], true);
  check('fulltext explained', r.message === 'QUERY_ERROR' && /GIN/.test(r.payload.error));
  r = await alter('struct_test', [{op: 'dropIndex', name: 'idx_extra'}, {op: 'dropIndex', name: 'uq_code'}, {op: 'dropColumn', name: 'extra2'}], true);
  check('drop index / constraint / column preview', JSON.stringify(r.payload?.statements) === JSON.stringify(['DROP INDEX "public"."idx_extra"', `ALTER TABLE "public"."struct_test"\n  DROP CONSTRAINT "uq_code",\n  DROP COLUMN "extra2"`]), JSON.stringify(r.payload));
  r = await alter('struct_test', [{op: 'dropIndex', name: 'idx_extra'}, {op: 'dropColumn', name: 'extra2'}]);
  check('drop index and column', r.message === 'STRUCTURE_CHANGE_APPLIED', JSON.stringify(r.payload));
  r = await alter('edit_nopk', [{op: 'addIndex', name: '', kind: 'PRIMARY', columns: [{name: 'b', length: null}]}], true);
  check('add primary key preview', r.payload?.statements?.[0] === 'ALTER TABLE "public"."edit_nopk"\n  ADD PRIMARY KEY ("b")', JSON.stringify(r.payload));
  r = await change('struct_test', {kind: 'copy', newName: 'struct_copy', withData: true});
  s = await select('SELECT * FROM struct_copy ORDER BY id');
  const copyInsert = await apply([{kind: 'insert', values: {code: 'x9'}}], 'struct_copy');
  check('copy with data, identity continues', r.message === 'STRUCTURE_CHANGE_APPLIED' && s.rows.length === 2 && s.rows[0].total_x2 === '10.00' && copyInsert.message === 'ROW_CHANGES_APPLIED', JSON.stringify(r.payload) + JSON.stringify(copyInsert.payload));
  r = await change('struct_copy', {kind: 'rename', newName: 'struct_copy2'});
  check('rename', r.message === 'STRUCTURE_CHANGE_APPLIED', JSON.stringify(r.payload));
  r = await change('struct_copy2', {kind: 'truncate'});
  s = await select('SELECT count(*) AS c FROM struct_copy2');
  check('truncate', r.message === 'STRUCTURE_CHANGE_APPLIED' && s.rows[0].c === '0', JSON.stringify(r.payload));
  r = await change('struct_copy2', {kind: 'drop'});
  check('drop table', r.message === 'STRUCTURE_CHANGE_APPLIED');

  // --- console
  let c = await sql(['SELECT 1 AS a, 2 AS a', 'CREATE TEMP TABLE tmp_x (id int)', 'INSERT INTO tmp_x VALUES (1), (2)', "DO $$ BEGIN RAISE NOTICE 'hello %', 1; END $$", 'USE blog', 'SELECT count(*) AS posts FROM posts', 'SELECT * FROM nope', 'SELECT 3']);
  check('console: duplicate column names', JSON.stringify(c.rows(0)) === JSON.stringify([{'a': 1, 'a#1': 2}]), JSON.stringify(c.rows(0)) + JSON.stringify(c.columns(0).map((x) => x.key)));
  check('console: affected rows and notices', c.finished[2].result?.affectedRows === 2 && c.finished[2].result.message === 'INSERT' && /NOTICE: hello 1/.test(c.finished[3].result?.message), JSON.stringify([c.finished[2].result, c.finished[3].result]));
  check('console: USE sets search_path', !c.finished[4].error && c.rows(5).length === 1, JSON.stringify(c.finished[4]) + c.errors.join());
  check('console: error does not stop others', c.errors.length === 1 && /relation "nope" does not exist/.test(c.errors[0]) && c.rows(7)[0]?.['?column?'] === 3, JSON.stringify(c.rows(7)));
  c = await sql(['SET search_path TO blog', 'SELECT count(*) AS n FROM posts']);
  check('console: SET search_path', !c.errors.length && c.rows(1).length === 1, c.errors.join());
  c = await sql(["SET statement_timeout = '1min'", 'CREATE TEMP TABLE leak_test (id int)']);
  const leak = await sql(['SHOW statement_timeout', 'SHOW search_path', "SELECT to_regclass('pg_temp.leak_test') AS t"], 'blog');
  check('session state does not leak', leak.rows(0)[0]?.statement_timeout === '0' && leak.rows(1)[0]?.search_path === 'blog, public' && leak.rows(2)[0]?.t === null, JSON.stringify([leak.rows(0), leak.rows(1), leak.rows(2)]));
  c = await sql(['BEGIN', "UPDATE edit_test SET name = 'tx' WHERE id = 1", 'SELECT 1/0', "UPDATE edit_test SET name = 'tx2' WHERE id = 1", 'ROLLBACK']);
  check('console: aborted transaction', c.errors.length === 2 && /division by zero/.test(c.errors[0]) && /current transaction is aborted/.test(c.errors[1]), c.errors.join(' | '));
  c = await sql(['SELECT generate_series(1, 5000) AS n'], 'public', {maxRows: 100});
  check('console: rows limited', c.rows(0).length === 100 && c.finished[0].result.rows === 5000 && c.finished[0].result.truncated, JSON.stringify(c.finished[0].result));

  // cancel
  const cancelTab = 'cancel' + Math.random();
  send('EXECUTE_STATEMENTS', {tabId: cancelTab, database: 'public', statements: ['SELECT pg_sleep(30)', 'SELECT 2']});
  await sleep(700);
  const processTab = 'pl' + Math.random();
  send('GET_PROCESSLIST', {tabId: processTab});
  const list = (await waitFor(() => forTab(processTab).find((m) => m.message === 'PROCESSLIST')))?.payload.processes || [];
  const sleeping = list.find((p) => /pg_sleep\(30\)/.test(p.info || ''));
  check('process list', sleeping && sleeping.own && sleeping.command === 'active' && sleeping.db === 'shop' && list.some((p) => p.info && /pg_stat_activity/.test(p.info)), JSON.stringify(sleeping));
  send('CANCEL_QUERY', {tabId: cancelTab});
  const cancelled = await waitFor(() => forTab(cancelTab).find((m) => m.message === 'EXECUTION_FINISHED'), 5000);
  const cancelError = forTab(cancelTab).find((m) => m.message === 'STATEMENT_FINISHED')?.payload.error;
  check('cancel query', cancelled && /canceling statement due to user request/.test(cancelError), cancelError);
  const killTab = 'kill' + Math.random();
  send('KILL_PROCESS', {tabId: killTab, id: 999999, connection: false});
  const killed = await waitFor(() => forTab(killTab).find((m) => ['PROCESS_KILLED', 'QUERY_ERROR'].includes(m.message)));
  check('kill unknown process', killed?.message === 'QUERY_ERROR' && /does not exist/.test(killed.payload.error), JSON.stringify(killed?.payload));

  // --- search
  const search = await request('SEARCH_DATABASE', {database: {name: 'public'}, term: 'KOWAL', mode: 'contains'}, ['DATABASE_SEARCH_FINISHED']);
  const found = forTab(search.tabId).filter((m) => m.message === 'DATABASE_SEARCH_RESULT').map((m) => m.payload);
  const searchNumber = await request('SEARCH_DATABASE', {database: {name: 'public'}, term: '9007199254740993', mode: 'exact'}, ['DATABASE_SEARCH_FINISHED']);
  const foundNumber = forTab(searchNumber.tabId).filter((m) => m.message === 'DATABASE_SEARCH_RESULT').map((m) => m.payload);
  check('search case insensitive', found.some((f) => f.table === 'customers') && search.payload.warnings.length === 0, JSON.stringify(found) + JSON.stringify(search.payload));
  check('search number as text', foundNumber.length === 1 && foundNumber[0].table === 'edit_test' && foundNumber[0].columns[0].name === 'big' && !foundNumber[0].columns[0].text, JSON.stringify(foundNumber));

  // --- dump and import
  const ticket = async (transfer) => {
    const t = await request('CREATE_TRANSFER', {transfer}, ['TRANSFER_TICKET']);
    return {tabId: t.tabId, ticket: t.payload?.ticket};
  };
  const upload = async (transfer, body) => {
    const t = await ticket(transfer);
    const res = await fetch(`${BASE}/api/transfer/${t.ticket}`, {method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body});
    return {status: res.status, result: await res.json()};
  };
  const dumpTables = ['value_test', 'edit_test', 'edit_nopk', 'struct_test', 'struct_child', 'struct_view'];
  const checksum = async () => {
    const res = await sql(dumpTables.slice(0, 5).map((t) => `SELECT md5(string_agg(x::text, '|' ORDER BY x::text)) AS sum FROM ${t} x`));
    return dumpTables.slice(0, 5).map((t, i) => `${t}:${res.rows(i)[0]?.sum}`).join(' ');
  };
  const before = await checksum();
  let t = await ticket({kind: 'dump', options: {database: 'public', tables: dumpTables, structure: true, data: true, dropTables: true, createDatabase: false, views: true, triggers: true}, gzip: false});
  let res = await fetch(`${BASE}/api/transfer/${t.ticket}`);
  const dump = await res.text();
  const dumpFinished = (await waitFor(() => forTab(t.tabId).find((m) => m.message === 'DUMP_FINISHED')))?.payload;
  check('dump finished', res.status === 200 && dumpFinished && !dumpFinished.error && dumpFinished.tables === 5, JSON.stringify(dumpFinished));
  check('dump content', dump.includes('CREATE TYPE "edit_status" AS ENUM') && dump.includes('CREATE OR REPLACE FUNCTION trg_struct_code_fn()') && dump.includes('"id" serial NOT NULL')
    && dump.includes('GENERATED BY DEFAULT AS IDENTITY') && dump.includes('ALTER TABLE "struct_child" ADD CONSTRAINT "fk_child_struct" FOREIGN KEY') && dump.includes("'\\x") && dump.includes('pg_catalog.setval(')
    && dump.includes('CREATE TRIGGER trg_struct_code BEFORE INSERT ON struct_test') && dump.includes('CREATE OR REPLACE VIEW "struct_view"') && !/public\./.test(dump.replace(/-- .*\n/g, '')), dump.slice(0, 3000));
  check('dump: referenced tables first, generated column left out', dump.indexOf('INSERT INTO "struct_test"') < dump.indexOf('INSERT INTO "struct_child"') && !/INSERT INTO "struct_test" \([^)]*total_x2/.test(dump));

  r = await sql(['DROP VIEW struct_view', 'DROP TABLE struct_child', 'DELETE FROM edit_test', 'UPDATE value_test SET data = NULL']);
  let imported = await upload({kind: 'import-sql', database: 'public', gzip: false, stopOnError: true, fileName: 'dump.sql'}, dump);
  check('dump imported', imported.status === 200 && !imported.result.failed && imported.result.errors.length === 0, JSON.stringify(imported.result.errors));
  check('round trip: data identical', (await checksum()) === before, `${before}\n${await checksum()}`);
  r = await apply([{kind: 'insert', values: {name: 'after import'}}]);
  s = await select("SELECT id FROM edit_test WHERE name = 'after import'");
  check('sequence continues after import', r.message === 'ROW_CHANGES_APPLIED' && s.rows[0]?.id === 5, JSON.stringify(s.rows));
  c = await sql(["INSERT INTO struct_test (code) VALUES ('lower')", "SELECT code FROM struct_test WHERE code = 'LOWER'", 'SELECT count(*) AS c FROM struct_view']);
  check('trigger and view restored', c.rows(1).length === 1 && Number(c.rows(2)[0]?.c) === 3, c.errors.join());

  imported = await upload({kind: 'import-sql', database: 'blog', gzip: false, stopOnError: true, fileName: 'x.sql'}, dump.replace(/(DROP VIEW|DROP TABLE)[^\n]*\n/g, ''));
  c = await sql(["SELECT count(*) AS c FROM blog.edit_test", "SELECT code FROM blog.struct_test ORDER BY id"]);
  check('dump imported into other schema', !imported.result.failed && Number(c.rows(0)[0]?.c) === 3 && c.rows(1).map((x) => x.code).join() === 'X1,X2', JSON.stringify(imported.result.errors) + JSON.stringify([c.rows(0), c.rows(1), c.errors]));
  await sql(['DROP TABLE blog.struct_child, blog.struct_test, blog.edit_test, blog.edit_nopk, blog.value_test CASCADE', 'DROP FUNCTION blog.trg_struct_code_fn()']);

  imported = await upload({kind: 'import-sql', database: 'public', gzip: false, stopOnError: true, fileName: 'x.sql'}, "SELECT 1;\nSELECT 'a\\';\nSELECT * FROM nope;\nSELECT 2;");
  check('import: backslash literal, stop on error', imported.result.statements === 2 && imported.result.failed && /nope/.test(imported.result.errors[0]?.error), JSON.stringify(imported.result));

  // CSV
  await sql(['DROP TABLE IF EXISTS csv_target', 'CREATE TABLE csv_target (id serial PRIMARY KEY, name varchar(50) NOT NULL, amount numeric(10,2), flag boolean)']);
  imported = await upload({kind: 'import-csv', gzip: false, fileName: 'a.csv', options: {database: 'public', table: 'csv_target', delimiter: ',', header: true, columns: ['name', 'amount', 'flag'], nullValue: 'empty', truncate: true}},
    'name,amount,flag\n"O\'Brien, \\x",10.5,true\nNowak,,f\n');
  s = await select('SELECT * FROM csv_target ORDER BY id');
  check('csv import', imported.result.rows === 2 && s.rows[0]?.name === "O'Brien, \\x" && s.rows[1].amount === null && s.rows[1].flag === 'false', JSON.stringify(imported.result) + JSON.stringify(s.rows));
  imported = await upload({kind: 'import-csv', gzip: false, fileName: 'a.csv', options: {database: 'public', table: 'csv_target', delimiter: ',', header: false, columns: ['name', 'amount'], nullValue: 'empty', truncate: false}},
    'ok,1\nbad,abc\n');
  s = await select('SELECT count(*) AS c FROM csv_target');
  check('csv error rolls back', imported.result.failed && imported.result.rows === 0 && s.rows[0].c === '2' && /invalid input syntax for type numeric/.test(imported.result.errors[0]?.error), JSON.stringify(imported.result));
  await sql(['DROP TABLE csv_target']);

  ws.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
