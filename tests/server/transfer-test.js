// dump / import: node transfer-test.js
const WebSocket = require('ws');
const zlib = require('zlib');
const BASE = 'http://php_flase:3001';
let failures = 0;
const check = (name, ok, info = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 300) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const http = require('http');

/** body sent, then connection is broken - as browser closed or proxy cut the upload */
const interruptedUpload = (ticket, body) => new Promise((resolve) => {
  const url = new URL(`${BASE}/api/transfer/${ticket}`);
  const request = http.request({hostname: url.hostname, port: url.port, path: url.pathname, method: 'POST',
    headers: {'Content-Type': 'application/octet-stream', 'Transfer-Encoding': 'chunked'}});
  request.on('error', () => resolve());
  request.write(body);
  setTimeout(() => { request.destroy(); resolve(); }, 1500);
});
/** beginning of gzip stream which can be decompressed (rest of the file never comes) */
const syncFlushedGzip = (text) => new Promise((resolve) => {
  const gzip = zlib.createGzip();
  const chunks = [];
  gzip.on('data', (chunk) => chunks.push(chunk));
  gzip.write(text);
  gzip.flush(zlib.constants.Z_SYNC_FLUSH, () => resolve(Buffer.concat(chunks)));
});
/** own connection, not of Flase - locked table makes it wait for lock_wait_timeout */
const directQuery = (host, sql, user = 'flase') => new Promise((resolve) => {
  const [hostname, port] = host.split(':');
  const connection = require('mysql').createConnection({host: hostname, port: Number(port) || 3306, user, password: user === 'root' ? 'root' : 'flase', database: 'shop'});
  connection.query('SET SESSION lock_wait_timeout = 3', () => connection.query(sql, (error, rows) => {
    connection.destroy();
    resolve({ok: !error, error: error?.message, rows});
  }));
});

(async () => {
  for (const dsn of ['mysql://mariadb', 'mysql://mysql']) {
    console.log(`\n=== ${dsn}`);
    const connection = {id: 't-' + dsn, dsn, username: 'flase', displayName: dsn, changeConfirmationRequired: false};
    const user = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();
    const ws = new WebSocket(`ws://php_flase:3001/ws/${user.token}`);
    const messages = [];
    ws.on('message', (m) => messages.push(JSON.parse(m)));
    await new Promise((r) => ws.on('open', r));
    const send = (command, payload) => ws.send(JSON.stringify({connectionData: {user, connection}, command, payload}));
    const waitFor = async (fn, ms = 20000) => { const start = Date.now(); while (Date.now() - start < ms) { const v = fn(); if (v) return v; await sleep(30); } return fn(); };
    let seq = 0;
    const sql = async (statements) => {
      const tabId = 'sql' + (++seq) + Math.random();
      send('EXECUTE_STATEMENTS', {tabId, database: 'shop', statements, stopOnError: false});
      await waitFor(() => messages.find((m) => m.payload?.tabId === tabId && m.message === 'EXECUTION_FINISHED'));
      const finished = messages.filter((m) => m.payload?.tabId === tabId && m.message === 'STATEMENT_FINISHED').map((m) => m.payload);
      const errors = finished.filter((f) => f.error).map((f) => f.error);
      return {errors, rows: (i) => messages.filter((m) => m.payload?.tabId === `${tabId}:${i}` && m.message === 'SINGLE_SELECT_RECORD').map((m) => m.payload.rowDataValue)};
    };
    const ticket = async (transfer) => {
      const tabId = 'tr' + (++seq) + Math.random();
      send('CREATE_TRANSFER', {tabId, transfer});
      const m = await waitFor(() => messages.find((x) => x.payload?.tabId === tabId && ['TRANSFER_TICKET', 'QUERY_ERROR'].includes(x.message)));
      return {tabId, ticket: m?.payload.ticket, error: m?.message === 'QUERY_ERROR' ? m.payload.error : null};
    };
    const upload = async (transfer, body) => {
      const t = await ticket(transfer);
      const res = await fetch(`${BASE}/api/transfer/${t.ticket}`, {method: 'POST', headers: {'Content-Type': 'application/octet-stream'}, body});
      const answer = await res.json();
      // 202 - file was uploaded, result of import comes over websocket
      if (res.status !== 202) return {tabId: t.tabId, status: res.status, result: answer};
      const finished = await waitFor(() => messages.find((m) => m.payload?.tabId === t.tabId && m.message === 'IMPORT_FINISHED'), 60000);
      return {tabId: t.tabId, status: finished ? 200 : 'no IMPORT_FINISHED', result: finished?.payload};
    };
    const checksums = async (tables) => {
      const r = await sql([`CHECKSUM TABLE ${tables.join(', ')}`]);
      return Object.fromEntries(r.rows(0).map((row) => [row.Table.split('.').pop(), String(row.Checksum)]));
    };
    const tables = ['value_test', 'edit_test', 'struct_test', 'struct_child'];


    // session state must not leak to other sessions of pool
    await sql(["SET SESSION sql_mode = ''", 'SET FOREIGN_KEY_CHECKS = 0', 'SET @leak = 1']);
    const leak = await sql(['SELECT @@SESSION.sql_mode AS mode, @@FOREIGN_KEY_CHECKS AS fk, @leak AS leak']);
    check('session state does not leak', leak.rows(0)[0]?.mode !== '' && String(leak.rows(0)[0]?.fk) === '1' && leak.rows(0)[0]?.leak === null, JSON.stringify(leak.rows(0)));

    // --- dump
    const original = await checksums(tables);
    const dumpOptions = {database: 'shop', tables: [...tables, 'struct_view'], structure: true, data: true, dropTables: true, createDatabase: false, views: true, triggers: true};
    let t = await ticket({kind: 'dump', options: dumpOptions, gzip: false});
    let res = await fetch(`${BASE}/api/transfer/${t.ticket}`);
    const dump = await res.text();
    const finished = (await waitFor(() => messages.find((m) => m.payload?.tabId === t.tabId && m.message === 'DUMP_FINISHED')))?.payload;
    check('dump download', res.status === 200 && /attachment; filename="shop-\d{8}-\d{4}\.sql"/.test(res.headers.get('content-disposition')), res.headers.get('content-disposition'));
    check('dump finished message', finished && !finished.error && finished.tables === 4 && finished.rows > 0 && finished.bytes === Buffer.byteLength(dump), JSON.stringify(finished));
    check('dump content', dump.includes('SET FOREIGN_KEY_CHECKS = 0;') && dump.includes('DROP TABLE IF EXISTS `value_test`;') && dump.includes('CREATE TABLE `struct_test`')
      && dump.includes("INSERT INTO `edit_test`") && dump.includes('CREATE ') && dump.includes('VIEW `struct_view`') && dump.includes('DELIMITER ;;') && dump.includes('CREATE TRIGGER'), dump.slice(0, 200));
    check('no DEFINER', !/DEFINER\s*=/i.test(dump));
    check('generated column not inserted', !/INSERT INTO `struct_test` \([^)]*total_x2/.test(dump));
    check('column with expression default is dumped', /INSERT INTO `struct_test` \([^)]*`created`/.test(dump), dump.match(/INSERT INTO `struct_test` \([^)]*\)/)?.[0]);
    check('binary as hex literal', /X'[0-9a-f]+'/.test(dump));
    res = await fetch(`${BASE}/api/transfer/${t.ticket}`);
    check('ticket works only once', res.status === 404);

    // gzip
    t = await ticket({kind: 'dump', options: {...dumpOptions, tables: ['edit_test'], data: true}, gzip: true});
    res = await fetch(`${BASE}/api/transfer/${t.ticket}`);
    const gz = Buffer.from(await res.arrayBuffer());
    const unzipped = zlib.gunzipSync(gz).toString('utf8');
    check('gzip dump', res.headers.get('content-type') === 'application/gzip' && unzipped.includes('CREATE TABLE `edit_test`') && /edit_test-\d{8}-\d{4}\.sql\.gz/.test(res.headers.get('content-disposition')), res.headers.get('content-disposition'));

    // structure / data chosen per table
    t = await ticket({kind: 'dump', options: {...dumpOptions, tableModes: {edit_test: 'structure', value_test: 'data', struct_test: 'both', struct_child: 'both', struct_view: 'data'}}, gzip: false});
    res = await fetch(`${BASE}/api/transfer/${t.ticket}`);
    const modesDump = await res.text();
    check('dump modes: structure only', modesDump.includes('CREATE TABLE `edit_test`') && !modesDump.includes('INSERT INTO `edit_test`'), modesDump.slice(0, 800));
    check('dump modes: data only', modesDump.includes('INSERT INTO `value_test`') && !modesDump.includes('CREATE TABLE `value_test`') && !modesDump.includes('DROP TABLE IF EXISTS `value_test`'));
    check('dump modes: both, trigger of table with structure', modesDump.includes('CREATE TABLE `struct_test`') && modesDump.includes('INSERT INTO `struct_test`') && modesDump.includes('CREATE TRIGGER'));
    check('dump modes: view with data only is left out', !modesDump.includes('`struct_view`'));
    t = await ticket({kind: 'dump', options: {...dumpOptions, structure: false, data: false, tableModes: {edit_test: 'fast'}}, gzip: false});
    check('unknown table mode refused', !!t.error, t.error);

    // views: used view first, names without database - dump imported into other database uses its own tables
    await sql(['DROP VIEW IF EXISTS a_dump_top', 'DROP VIEW IF EXISTS z_dump_base', 'CREATE VIEW z_dump_base AS SELECT id, name FROM edit_test',
      'CREATE VIEW a_dump_top AS SELECT id, UPPER(name) AS big_name FROM z_dump_base']);
    t = await ticket({kind: 'dump', options: {...dumpOptions, tables: ['edit_test', 'z_dump_base', 'a_dump_top']}, gzip: false});
    const viewDump = await (await fetch(`${BASE}/api/transfer/${t.ticket}`)).text();
    const viewImport = await upload({kind: 'import-sql', database: 'blog', gzip: false, stopOnError: true, fileName: 'views.sql'}, viewDump);
    const viewCheck = await sql(["SELECT VIEW_DEFINITION AS d FROM information_schema.VIEWS WHERE TABLE_SCHEMA = 'blog' AND TABLE_NAME = 'a_dump_top'", 'SELECT COUNT(*) AS n FROM blog.a_dump_top']);
    check('views: used view first, imported into other database', viewDump.indexOf('VIEW `z_dump_base`') < viewDump.indexOf('VIEW `a_dump_top`') && !viewDump.includes('`shop`.')
      && !viewImport.result.failed && !(viewCheck.rows(0)[0]?.d || '').includes('`shop`') && String(viewCheck.rows(1)[0]?.n) === '3', JSON.stringify(viewImport.result.errors) + JSON.stringify(viewCheck.rows(0)));
    await sql(['DROP VIEW IF EXISTS blog.a_dump_top', 'DROP VIEW IF EXISTS blog.z_dump_base', 'DROP TABLE IF EXISTS blog.edit_test', 'DROP VIEW a_dump_top', 'DROP VIEW z_dump_base']);

    // statements of data: skip existing / upsert / UPDATE / one row per INSERT / TRUNCATE
    const dataDump = async (options) => {
      const d = await ticket({kind: 'dump', options: {...dumpOptions, tables: ['edit_test'], tableModes: {edit_test: 'data'}, ...options}, gzip: false});
      const text = await (await fetch(`${BASE}/api/transfer/${d.ticket}`)).text();
      const done = (await waitFor(() => messages.find((m) => m.payload?.tabId === d.tabId && m.message === 'DUMP_FINISHED')))?.payload;
      return {text, done};
    };
    const restoreWith = async (text) => (await upload({kind: 'import-sql', database: 'shop', gzip: false, stopOnError: true, fileName: 'data.sql'}, text)).result;
    const names = async () => (await sql(['SELECT id, name FROM edit_test ORDER BY id'])).rows(0).map((row) => `${row.id}:${row.name}`).join(',');
    const breakRows = () => sql(["UPDATE edit_test SET name = 'changed' WHERE id = 1", 'DELETE FROM edit_test WHERE id = 3']);
    const editOriginal = await checksums(['edit_test']);
    // all dumps of original rows - every check breaks the rows first
    const ignoreDump = await dataDump({insertMode: 'ignore'});
    const upsertDump = await dataDump({insertMode: 'upsert'});
    const updateDump = await dataDump({insertMode: 'update'});
    const rowDump = await dataDump({rowPerInsert: true, truncateData: true});
    let data = ignoreDump;
    check('dump INSERT IGNORE', /^INSERT IGNORE INTO `edit_test`/m.test(data.text), data.text.slice(-300));
    await breakRows();
    let restoredData = await restoreWith(data.text);
    check('skip existing: missing row added, changed row kept', !restoredData.failed && await names() === '1:changed,2:b,3:c', await names());
    data = upsertDump;
    await breakRows();
    restoredData = await restoreWith(data.text);
    check('upsert: dump restores changed and missing rows', /ON DUPLICATE KEY UPDATE `name` = VALUES\(`name`\)/.test(data.text) && !restoredData.failed
      && JSON.stringify(await checksums(['edit_test'])) === JSON.stringify(editOriginal), data.text.slice(-400));
    data = updateDump;
    await breakRows();
    restoredData = await restoreWith(data.text);
    check('UPDATE: changed row restored, missing row not added', /^UPDATE `edit_test` SET `name` = 'a', .* WHERE `id` = 1;$/m.test(data.text) && !data.text.includes('INSERT')
      && !restoredData.failed && await names() === '1:a,2:b', await names());
    data = rowDump;
    await sql(["INSERT INTO edit_test (id, name) VALUES (9, 'extra')"]);
    restoredData = await restoreWith(data.text);
    check('one row per INSERT, TRUNCATE before data', (data.text.match(/^INSERT INTO `edit_test`/gm) || []).length === 3 && data.text.includes('TRUNCATE TABLE `edit_test`;')
      && !restoredData.failed && JSON.stringify(await checksums(['edit_test'])) === JSON.stringify(editOriginal), await names());
    data = await dataDump({tables: ['edit_nopk'], tableModes: {edit_nopk: 'data'}, insertMode: 'upsert'});
    check('table without primary key: plain INSERT and warning', JSON.stringify(data.done?.withoutPrimaryKey) === '["edit_nopk"]'
      && data.text.includes('-- table has no primary key') && /^INSERT INTO `edit_nopk`/m.test(data.text) && !data.text.includes('ON DUPLICATE'), JSON.stringify(data.done));
    t = await ticket({kind: 'dump', options: {...dumpOptions, insertMode: 'replace'}, gzip: false});
    check('unknown statement of data refused', !!t.error, t.error);

    // progress and cancel of a big dump - reading of the download is paused, server waits for it
    await sql(['DROP TABLE IF EXISTS dump_big', 'CREATE TABLE dump_big (id INT AUTO_INCREMENT PRIMARY KEY, t TEXT)', 
      "INSERT INTO dump_big (t) SELECT REPEAT('x', 1000) FROM information_schema.COLUMNS a, information_schema.COLUMNS b LIMIT 30000", 'ANALYZE TABLE dump_big']);
    const bigCount = await sql(['SELECT COUNT(*) AS n FROM dump_big']);
    check('big table for dump', String(bigCount.rows(0)[0]?.n) === '30000', JSON.stringify(bigCount.rows(0)) + bigCount.errors.join());
    t = await ticket({kind: 'dump', options: {...dumpOptions, tables: ['dump_big']}, gzip: false});
    res = await fetch(`${BASE}/api/transfer/${t.ticket}`);
    const reader = res.body.getReader();
    let received = 0;
    for (let i = 0; i < 20; i++) received += (await reader.read()).value?.length || 0;
    const bigProgress = (await waitFor(() => messages.filter((m) => m.payload?.tabId === t.tabId && m.message === 'DUMP_PROGRESS').pop(), 5000))?.payload;
    check('dump progress', bigProgress && bigProgress.table === 'dump_big' && bigProgress.tablesTotal === 1 && bigProgress.estimatedRows > 10000
      && bigProgress.rows > 0 && bigProgress.rows < 30000 && bigProgress.bytes > 0, JSON.stringify(bigProgress));

    // other session must not stop the dump of this tab
    const other = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: {...connection, id: connection.id + '-other'}})})).json();
    const otherWs = new WebSocket(`ws://php_flase:3001/ws/${other.token}`);
    const otherMessages = [];
    otherWs.on('message', (m) => otherMessages.push(JSON.parse(m)));
    await new Promise((r) => otherWs.on('open', r));
    otherWs.send(JSON.stringify({connectionData: {user: other, connection: {...connection, id: connection.id + '-other'}}, command: 'CANCEL_QUERY', payload: {tabId: t.tabId}}));
    const otherAnswer = await waitFor(() => otherMessages.find((m) => m.message === 'QUERY_CANCELLED'), 5000);
    await sleep(300);
    check('other session cannot cancel dump', otherAnswer?.payload.cancelled === false
      && !messages.some((m) => m.payload?.tabId === t.tabId && m.message === 'DUMP_FINISHED'), JSON.stringify(otherAnswer?.payload));
    otherWs.close();
    await fetch(`${BASE}/api/disconnect`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: other.token})});

    const cancelStarted = Date.now();
    send('CANCEL_QUERY', {tabId: t.tabId});
    const cancelledDump = (await waitFor(() => messages.find((m) => m.payload?.tabId === t.tabId && m.message === 'DUMP_FINISHED'), 5000))?.payload;
    let brokenOff = false;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        received += chunk.value.length;
      }
    } catch (e) {
      brokenOff = true;
    }
    check('dump cancelled', cancelledDump?.cancelled === true && /cancelled/.test(cancelledDump.error) && Date.now() - cancelStarted < 3000, JSON.stringify(cancelledDump));
    check('cancelled download is broken off, not complete file', brokenOff && received < 30 * 1024 * 1024, `broken=${brokenOff} received=${received}`);
    const afterCancel = await sql(['SELECT COUNT(*) AS n FROM dump_big', 'SELECT 1 AS one']);
    check('connections work after cancel', afterCancel.errors.length === 0 && String(afterCancel.rows(0)[0]?.n) === '30000', afterCancel.errors.join());

    // connection of dump killed while download waits - dump ends with error, server lives
    t = await ticket({kind: 'dump', options: {...dumpOptions, tables: ['dump_big']}, gzip: false});
    const killedRes = await fetch(`${BASE}/api/transfer/${t.ticket}`);
    const killedReader = killedRes.body.getReader();
    for (let i = 0; i < 5; i++) await killedReader.read();
    const dumpThread = (await sql(["SELECT ID FROM information_schema.PROCESSLIST WHERE INFO LIKE 'SELECT %dump_big%' AND INFO NOT LIKE '%PROCESSLIST%'"])).rows(0)[0]?.ID;
    await sql([`KILL ${dumpThread}`]);
    await sleep(500);
    // incomplete dump must not look like complete file - download is broken off
    let killedBroken = false;
    try { for (;;) { if ((await killedReader.read()).done) break; } } catch (e) { killedBroken = true; }
    const killedDump = (await waitFor(() => messages.find((m) => m.payload?.tabId === t.tabId && m.message === 'DUMP_FINISHED'), 10000))?.payload;
    const aliveAfterKill = await fetch(`${BASE}/api/config`).then((x) => x.status).catch(() => 0);
    check('lost connection of dump: error, download broken off, server alive', !!dumpThread && !!killedDump?.error && killedBroken && aliveAfterKill === 200, `${dumpThread} ${JSON.stringify(killedDump)} broken=${killedBroken} ${aliveAfterKill}`);

    // long download: tab closed (connections of idle session are released after 30 s) and browser does not read
    // for longer than net_write_timeout of server - dump must still be complete
    if (dsn === 'mysql://mariadb') {
      // bigger than buffers of network - server must wait for the browser
      await sql(['CREATE TABLE dump_long AS SELECT * FROM dump_big', 'INSERT INTO dump_long SELECT * FROM dump_big', 'INSERT INTO dump_long SELECT * FROM dump_big']);
      await directQuery(dsn.replace('mysql://', ''), 'SET GLOBAL net_write_timeout = 5', 'root');
      const other = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: {...connection, id: connection.id + '-long'}})})).json();
      const otherConnection = {...connection, id: connection.id + '-long'};
      const otherWs = new WebSocket(`ws://php_flase:3001/ws/${other.token}`);
      const otherMessages = [];
      otherWs.on('message', (m) => otherMessages.push(JSON.parse(m)));
      await new Promise((r) => otherWs.on('open', r));
      otherWs.send(JSON.stringify({connectionData: {user: other, connection: otherConnection}, command: 'CREATE_TRANSFER',
        payload: {tabId: 'long', transfer: {kind: 'dump', gzip: false, options: {...dumpOptions, tables: ['dump_long', 'edit_test']}}}}));
      const longTicket = (await waitFor(() => otherMessages.find((m) => m.message === 'TRANSFER_TICKET')))?.payload.ticket;
      const longRes = await fetch(`${BASE}/api/transfer/${longTicket}`);
      const longReader = longRes.body.getReader();
      let longText = '';
      const decoder = new TextDecoder();
      for (let i = 0; i < 5; i++) longText += decoder.decode((await longReader.read()).value, {stream: true});
      otherWs.close();
      await sleep(35000);
      let longBroken = false;
      try { for (;;) { const chunk = await longReader.read(); if (chunk.done) break; longText += decoder.decode(chunk.value, {stream: true}); } } catch (e) { longBroken = true; }
      await directQuery(dsn.replace('mysql://', ''), 'SET GLOBAL net_write_timeout = 60', 'root');
      check('long download with closed tab and pause of browser: complete dump', !longBroken && !/dump is not complete/.test(longText)
        && /CREATE TABLE `edit_test`/.test(longText) && /SET FOREIGN_KEY_CHECKS = 1;\s*$/.test(longText), `broken=${longBroken} ${longText.slice(-200)}`);
      await fetch(`${BASE}/api/disconnect`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: other.token})});
      await sql(['DROP TABLE dump_long']);
    }
    await sql(['DROP TABLE dump_big']);

    // --- break data, import dump, compare
    let r = await sql(['DELETE FROM struct_child', 'DELETE FROM edit_test', 'UPDATE value_test SET data = NULL, doc = NULL', 'DROP VIEW struct_view', 'DROP TRIGGER trg_struct_code']);
    check('data broken', JSON.stringify(await checksums(tables)) !== JSON.stringify(original), r.errors.join());
    let imp = await upload({kind: 'import-sql', database: 'shop', gzip: false, stopOnError: true, fileName: 'dump.sql'}, dump);
    check('import of dump', imp.status === 200 && !imp.result.failed && imp.result.errors.length === 0 && imp.result.statements > 10 && imp.result.bytes === Buffer.byteLength(dump), JSON.stringify(imp.result).slice(0, 300));
    const restored = await checksums(tables);
    check('round trip: data identical', JSON.stringify(restored) === JSON.stringify(original), `${JSON.stringify(original)} vs ${JSON.stringify(restored)}`);
    r = await sql(["SELECT COUNT(*) AS n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = 'shop' AND TRIGGER_NAME = 'trg_struct_code'", 'SELECT COUNT(*) AS n FROM struct_view', "SELECT HEX(bin) AS h FROM value_test WHERE id = 1", "SELECT big FROM edit_test WHERE id = 1"]);
    check('trigger and view restored', String(r.rows(0)[0]?.n) === '1' && Number(r.rows(1)[0]?.n) > 0, JSON.stringify([r.rows(0), r.rows(1)]));
    check('binary and bigint exact', r.rows(2)[0]?.h === '00FF10A0' && String(r.rows(3)[0]?.big) === '9007199254740993', JSON.stringify([r.rows(2), r.rows(3)]));
    const progress = messages.filter((m) => m.payload?.tabId === imp.tabId && m.message === 'IMPORT_PROGRESS');
    check('import progress via websocket', messages.some((m) => m.payload?.tabId === imp.tabId && m.message === 'IMPORT_FINISHED'), String(progress.length));

    // gzip import
    imp = await upload({kind: 'import-sql', database: 'shop', gzip: true, stopOnError: true, fileName: 'x.sql.gz'}, zlib.gzipSync("SELECT 1;\nSET @gz = 'ok';"));
    check('gzip import', imp.status === 200 && imp.result.statements === 2 && !imp.result.failed, JSON.stringify(imp.result));

    // --- long statement does not hold up the upload - answer comes when the file is uploaded, not when it is imported
    {
      const t = await ticket({kind: 'import-sql', database: 'shop', gzip: false, stopOnError: true, fileName: 'slow.sql'});
      const started = Date.now();
      const res = await fetch(`${BASE}/api/transfer/${t.ticket}`, {method: 'POST', headers: {'Content-Type': 'application/octet-stream'},
        body: 'SELECT SLEEP(3);\n' + 'SELECT 1;\n'.repeat(20000)});
      const answered = Date.now() - started;
      const finished = await waitFor(() => messages.find((m) => m.payload?.tabId === t.tabId && m.message === 'IMPORT_FINISHED'), 20000);
      check('long statement: answer after upload (202), result over websocket', res.status === 202 && answered < 2000 && finished?.payload.statements === 20001 && Date.now() - started >= 3000,
        `${res.status} after ${answered} ms ${JSON.stringify(finished?.payload).slice(0, 200)}`);
    }

    // --- interrupted upload must not leave LOCK TABLES of mysqldump on connection of the pool
    const host = dsn.replace('mysql://', '');
    for (const gzip of [false, true]) {
      const t = await ticket({kind: 'import-sql', database: 'shop', gzip, stopOnError: true, fileName: gzip ? 'cut.sql.gz' : 'cut.sql'});
      const text = 'LOCK TABLES edit_test WRITE;\nINSERT INTO edit_test (name) VALUES (\'cut upload\');\n';
      const body = gzip ? await syncFlushedGzip(text) : Buffer.from(text);
      await interruptedUpload(t.ticket, body);
      const finished = await waitFor(() => messages.find((m) => m.payload?.tabId === t.tabId && m.message === 'IMPORT_FINISHED'), 10000);
      const lock = await directQuery(host, 'SELECT COUNT(*) AS n FROM edit_test');
      check(`interrupted ${gzip ? 'gzip ' : ''}upload: import ends, table is not locked`, !!finished && finished.payload.errors.some((e) => /interrupted/i.test(e.error)) && lock.ok,
        `${JSON.stringify(finished?.payload)} ${lock.error || ''}`);
    }
    await sql(["DELETE FROM edit_test WHERE name = 'cut upload'"]);

    {
      // --- import without checks of foreign keys: child row before its parent
      await sql(['DROP TABLE IF EXISTS fk_imp_child', 'DROP TABLE IF EXISTS fk_imp_parent', 'CREATE TABLE fk_imp_parent (id INT PRIMARY KEY)',
        'CREATE TABLE fk_imp_child (id INT PRIMARY KEY, parent_id INT, FOREIGN KEY (parent_id) REFERENCES fk_imp_parent (id))']);
      const script = 'INSERT INTO fk_imp_child VALUES (1, 10);\nINSERT INTO fk_imp_parent VALUES (10);';
      let fk = await upload({kind: 'import-sql', database: 'shop', gzip: false, stopOnError: true, fileName: 'fk.sql'}, script);
      check('import with foreign key checks: child before parent fails', fk.result?.failed && /foreign key/i.test(fk.result.errors[0]?.error || ''), JSON.stringify(fk.result));
      fk = await upload({kind: 'import-sql', database: 'shop', gzip: false, stopOnError: true, fileName: 'fk.sql', ignoreForeignKeys: true}, script);
      check('import without foreign key checks: child before parent', !fk.result?.failed && fk.result.statements === 2, JSON.stringify(fk.result));
      fk = await upload({kind: 'import-csv', gzip: false, fileName: 'fk.csv', ignoreForeignKeys: true,
        options: {database: 'shop', table: 'fk_imp_child', delimiter: ',', header: false, columns: ['id', 'parent_id'], nullValue: 'empty', truncate: false}}, '2,20\n');
      check('CSV import without foreign key checks', !fk.result?.failed && fk.result.rows === 1, JSON.stringify(fk.result));
      const after = await sql(['INSERT INTO fk_imp_child VALUES (3, 30)']);
      check('checks of foreign keys are on again for next sessions', after.errors.length === 1 && /foreign key/i.test(after.errors[0]), after.errors.join());
      await sql(['DROP TABLE fk_imp_child', 'DROP TABLE fk_imp_parent']);
    }

    // errors
    const broken = 'CREATE TEMPORARY TABLE tmp_i (a INT);\nINSERT INTO tmp_i VALUES (1);\nINSERT INTO missing_table VALUES (1);\nINSERT INTO tmp_i VALUES (2);';
    imp = await upload({kind: 'import-sql', database: 'shop', gzip: false, stopOnError: true, fileName: 'x.sql'}, broken);
    check('stop on error', imp.result.failed && imp.result.statements === 2 && imp.result.errors.length === 1 && /missing_table/.test(imp.result.errors[0].error), JSON.stringify(imp.result));
    imp = await upload({kind: 'import-sql', database: 'shop', gzip: false, stopOnError: false, fileName: 'x.sql'}, broken);
    check('continue on error', !imp.result.failed && imp.result.statements === 3 && imp.result.errors.length === 1, JSON.stringify(imp.result));

    // cancel
    const slow = Array.from({length: 40}, (v, i) => `SELECT SLEEP(0.2) AS s${i};`).join('\n');
    const cancelTicket = await ticket({kind: 'import-sql', database: 'shop', gzip: false, stopOnError: true, fileName: 'slow.sql'});
    const started = Date.now();
    const pending = fetch(`${BASE}/api/transfer/${cancelTicket.ticket}`, {method: 'POST', body: slow}).then((x) => x.json());
    await sleep(700);
    send('CANCEL_QUERY', {tabId: cancelTicket.tabId});
    // answer of upload (202), result of import over websocket
    await pending;
    const cancelled = (await waitFor(() => messages.find((m) => m.payload?.tabId === cancelTicket.tabId && m.message === 'IMPORT_FINISHED'), 10000))?.payload;
    check('import cancelled', cancelled.cancelled === true && cancelled.statements < 40 && Date.now() - started < 4000, JSON.stringify(cancelled));

    // --- CSV
    await sql(['DROP TABLE IF EXISTS csv_target', 'CREATE TABLE csv_target (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50) NOT NULL, note TEXT NULL, amount DECIMAL(10,2) NULL)']);
    const csv = 'name,skip,note,amount\r\n"Kowalski, Jan",x,"say ""hi""",10.50\nNowak,x,,\n"Empty",x,"",3\n"Multi\nline",x,\\N,1';
    const csvOptions = {database: 'shop', table: 'csv_target', delimiter: ',', header: true, columns: ['name', null, 'note', 'amount'], nullValue: 'empty', truncate: false};
    imp = await upload({kind: 'import-csv', options: csvOptions, gzip: false, fileName: 'x.csv'}, csv);
    r = await sql(['SELECT name, note, amount FROM csv_target ORDER BY id']);
    let rows = r.rows(0);
    check('csv import', imp.status === 200 && imp.result.rows === 4 && !imp.result.failed, JSON.stringify(imp.result));
    check('csv values', rows[0]?.name === 'Kowalski, Jan' && rows[0].note === 'say "hi"' && rows[0].amount === '10.50' && rows[3].name === 'Multi\nline', JSON.stringify(rows));
    check('csv NULL vs empty string', rows[1].note === null && rows[1].amount === null && rows[2].note === '' && rows[3].note === '\\N', JSON.stringify(rows));
    imp = await upload({kind: 'import-csv', options: {...csvOptions, delimiter: ';', header: false, columns: ['name', 'note'], nullValue: '\\N', truncate: true}, gzip: false, fileName: 'x.csv'}, 'A;\\N\nB;b\n');
    rows = (await sql(['SELECT name, note FROM csv_target ORDER BY id'])).rows(0);
    check('csv truncate, ; and \\N', imp.result.rows === 2 && rows.length === 2 && rows[0].note === null && rows[1].note === 'b', JSON.stringify(rows));
    const bigCsv = Array.from({length: 1200}, (v, i) => `row${i},${i === 1100 ? 'not-a-number' : i}`).join('\n');
    imp = await upload({kind: 'import-csv', options: {...csvOptions, header: false, columns: ['name', 'amount'], truncate: false}, gzip: false, fileName: 'x.csv'}, bigCsv);
    rows = (await sql(['SELECT COUNT(*) AS n FROM csv_target'])).rows(0);
    check('csv error rolls back everything', imp.result.failed && imp.result.rows === 0 && String(rows[0].n) === '2' && /1001-1200/.test(imp.result.errors[0]?.statement || ''), JSON.stringify(imp.result).slice(0, 300) + ' n=' + JSON.stringify(rows));
    // byte order mark of Excel CSV is not imported into the first value
    imp = await upload({kind: 'import-csv', options: {...csvOptions, header: false, columns: ['name'], truncate: true}, gzip: false, fileName: 'x.csv'},
      Buffer.concat([Buffer.from([0xEF, 0xBB, 0xBF]), Buffer.from('Kowalski\nNowak\n')]));
    rows = (await sql(['SELECT name, CHAR_LENGTH(name) AS len FROM csv_target ORDER BY id'])).rows(0);
    check('csv: UTF-8 byte order mark left out', imp.result.rows === 2 && rows[0]?.name === 'Kowalski' && String(rows[0]?.len) === '8', JSON.stringify(rows));
    t = await ticket({kind: 'import-csv', options: {...csvOptions, columns: [null, null]}, gzip: false, fileName: 'x.csv'});
    check('csv without target column refused', !!t.error, t.error);
    await sql(['DROP TABLE csv_target']);

    ws.close();
    await fetch(`${BASE}/api/disconnect`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: user.token})});
  }
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
