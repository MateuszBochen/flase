// dump / import: node transfer-test.js
const WebSocket = require('ws');
const zlib = require('zlib');
const BASE = 'http://php_flase:3001';
let failures = 0;
const check = (name, ok, info = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 300) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
      return {tabId: t.tabId, status: res.status, result: await res.json()};
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
    const cancelled = await pending;
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
    t = await ticket({kind: 'import-csv', options: {...csvOptions, columns: [null, null]}, gzip: false, fileName: 'x.csv'});
    check('csv without target column refused', !!t.error, t.error);
    await sql(['DROP TABLE csv_target']);

    ws.close();
    await fetch(`${BASE}/api/disconnect`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: user.token})});
  }
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
