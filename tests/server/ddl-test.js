// structure changes: node ddl-test.js <baseUrl>
const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://php_flase:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const col = (name, type, extra = {}) => ({
  name, type, nullable: true, defaultValue: {kind: 'none'}, autoIncrement: false, onUpdateCurrentTimestamp: false, comment: '', collation: null, ...extra,
});

(async () => {
  for (const dsn of ['mysql://mariadb', 'mysql://mysql']) {
    console.log(`\n=== ${dsn}`);
    const connection = {id: 'd-' + dsn, dsn, username: 'flase', displayName: dsn, changeConfirmationRequired: false};
    const user = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();
    const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws/${user.token}`);
    const messages = [];
    ws.on('message', (m) => messages.push(JSON.parse(m)));
    await new Promise((r) => ws.on('open', r));
    let seq = 0;
    const request = async (command, payload) => {
      const tabId = 'd' + (++seq);
      ws.send(JSON.stringify({connectionData: {user, connection}, command, payload: {...payload, tabId}}));
      for (let i = 0; i < 200; i++) {
        const m = messages.find((x) => x.payload?.tabId === tabId && ['TABLE_STRUCTURE', 'STRUCTURE_CHANGE_PREVIEW', 'STRUCTURE_CHANGE_APPLIED', 'QUERY_ERROR', 'QUERY_FINISHED'].includes(x.message));
        if (m) return {...m, rows: messages.filter((x) => x.payload?.tabId === tabId && x.message === 'SINGLE_SELECT_RECORD').map((x) => x.payload.rowDataValue)};
        await sleep(30);
      }
      return {};
    };
    const table = (name) => ({databaseName: 'shop', name});
    const change = (name, changeData, dryRun = false) => request('CHANGE_STRUCTURE', {table: table(name), change: changeData, dryRun});
    const alter = (name, operations, dryRun = false) => change(name, {kind: 'alter', operations}, dryRun);
    const structure = async (name) => (await request('GET_TABLE_STRUCTURE', {table: table(name)}));
    const select = (sql) => request('SEND_SELECT_QUERY', {query: sql, database: {name: 'shop'}});
    const columnsOf = async (name) => Object.fromEntries((await structure(name)).payload.columns.map((c) => [c.name, c]));

    // cleanup from previous run
    await change('ddl_test', {kind: 'drop'});
    await change('ddl_test2', {kind: 'drop'});
    await change('ddl_copy_empty', {kind: 'drop'});

    // --- copy
    let r = await change('struct_test', {kind: 'copy', newName: 'ddl_test', withData: true}, true);
    const realColumns = '`id`, `code`, `customer_id`, `status`, `title`, `created`, `total`';
    check('copy preview leaves generated column out', r.message === 'STRUCTURE_CHANGE_PREVIEW' && r.payload.statements.join(' | ') === `CREATE TABLE \`shop\`.\`ddl_test\` LIKE \`shop\`.\`struct_test\` | INSERT INTO \`shop\`.\`ddl_test\` (${realColumns}) SELECT ${realColumns} FROM \`shop\`.\`struct_test\``, r.payload?.statements?.join(' | '));
    check('preview does not create table', (await structure('ddl_test')).message === 'QUERY_ERROR');
    r = await change('struct_test', {kind: 'copy', newName: 'ddl_copy_empty', withData: false});
    check('copy without data', r.message === 'STRUCTURE_CHANGE_APPLIED' && r.payload.statements.length === 1, r.payload?.error);
    check('copy without data has no rows', String((await select('SELECT COUNT(*) AS n FROM ddl_copy_empty')).rows[0]?.n) === '0');
    await change('ddl_copy_empty', {kind: 'drop'});
    r = await change('struct_test', {kind: 'copy', newName: 'ddl_test', withData: true});
    r = await select('SELECT COUNT(*) AS n, SUM(total_x2) AS x2 FROM ddl_test');
    check('copy with data (generated column computed)', String(r.rows[0]?.n) === '2' && Number(r.rows[0]?.x2) === 24, JSON.stringify(r.rows[0]) + (r.payload?.error || ''));
    let s = (await structure('ddl_test')).payload;
    check('copy keeps columns and indexes', s.columns.length === 8 && s.indexes.some((i) => i.name === 'idx_title_status'), s.columns.length + ' ' + s.indexes.map((i) => i.name));

    // --- add column with string default, comment, position
    r = await alter('ddl_test', [{op: 'addColumn', column: col('note', 'varchar(50)', {defaultValue: {kind: 'value', value: "it's"}, comment: 'my note'}), position: {kind: 'after', column: 'code'}}], true);
    check('add column preview', r.payload?.statements?.[0] === "ALTER TABLE `shop`.`ddl_test`\n  ADD COLUMN `note` varchar(50) NULL DEFAULT 'it\\'s' COMMENT 'my note' AFTER `code`", JSON.stringify(r.payload?.statements));
    r = await alter('ddl_test', [{op: 'addColumn', column: col('note', 'varchar(50)', {defaultValue: {kind: 'value', value: "it's"}, comment: 'my note'}), position: {kind: 'after', column: 'code'}}]);
    let c = await columnsOf('ddl_test');
    check('column added', r.message === 'STRUCTURE_CHANGE_APPLIED' && c.note?.defaultValue === "it's" && c.note.comment === 'my note', r.payload?.error || JSON.stringify(c.note));
    s = (await structure('ddl_test')).payload;
    check('column position', s.columns.map((x) => x.name).slice(0, 3).join() === 'id,code,note', s.columns.map((x) => x.name).join());

    // --- change column: rename, retype, keep collation, move first
    r = await alter('ddl_test', [{op: 'changeColumn', name: 'note', column: col('memo', 'varchar(80)', {nullable: false, defaultValue: {kind: 'value', value: ''}, collation: 'utf8mb4_bin'}), position: {kind: 'first'}}]);
    c = await columnsOf('ddl_test');
    s = (await structure('ddl_test')).payload;
    check('column changed', r.message === 'STRUCTURE_CHANGE_APPLIED' && !c.note && c.memo?.type === 'varchar(80)' && !c.memo.nullable && c.memo.collation === 'utf8mb4_bin' && s.columns[0].name === 'memo', r.payload?.error || JSON.stringify(c.memo));

    // --- timestamp with on update, expression default, several operations in one ALTER
    r = await alter('ddl_test', [
      {op: 'addColumn', column: col('ts', 'datetime', {nullable: false, defaultValue: {kind: 'expression', value: 'CURRENT_TIMESTAMP'}, onUpdateCurrentTimestamp: true}), position: {kind: 'end'}},
      {op: 'addColumn', column: col('uid', 'varchar(36)', {defaultValue: {kind: 'expression', value: "concat('id-', 1)"}}), position: {kind: 'end'}},
      {op: 'addColumn', column: col('kind', "enum('x;y','it''s')", {defaultValue: {kind: 'value', value: 'x;y'}}), position: {kind: 'end'}},
    ]);
    c = await columnsOf('ddl_test');
    check('several operations in one ALTER', r.message === 'STRUCTURE_CHANGE_APPLIED' && r.payload.statements.length === 1, r.payload?.error);
    check('on update current timestamp', /on update current_timestamp/i.test(c.ts?.extra || ''), c.ts?.extra);
    check('expression default', /concat/i.test(c.uid?.defaultValue || ''), c.uid?.defaultValue);
    check('expression default detected', c.uid?.defaultIsExpression === true && c.ts?.defaultIsExpression === true && c.kind?.defaultIsExpression === false, JSON.stringify([c.uid?.defaultIsExpression, c.ts?.defaultIsExpression, c.kind?.defaultIsExpression]));
    check('enum with ; and apostrophe', c.kind?.type === "enum('x;y','it''s')" && c.kind.defaultValue === 'x;y', JSON.stringify(c.kind));

    // --- indexes
    r = await alter('ddl_test', [
      {op: 'addIndex', name: 'idx_memo', kind: 'INDEX', columns: [{name: 'memo', length: 10}, {name: 'code', length: null}]},
      {op: 'addIndex', name: '', kind: 'UNIQUE', columns: [{name: 'uid', length: null}, {name: 'id', length: null}]},
    ]);
    s = (await structure('ddl_test')).payload;
    const memoIndex = s.indexes.find((i) => i.name === 'idx_memo');
    check('index added', r.message === 'STRUCTURE_CHANGE_APPLIED' && JSON.stringify(memoIndex?.columns.map((x) => [x.name, x.subPart])) === '[["memo",10],["code",null]]', r.payload?.error);
    check('unnamed unique index', s.indexes.some((i) => i.unique && i.columns[0].name === 'uid'), s.indexes.map((i) => i.name).join());
    r = await alter('ddl_test', [{op: 'dropIndex', name: 'idx_memo'}, {op: 'dropColumn', name: 'ts'}]);
    s = (await structure('ddl_test')).payload;
    check('drop index and column', r.message === 'STRUCTURE_CHANGE_APPLIED' && !s.indexes.some((i) => i.name === 'idx_memo') && !s.columns.some((x) => x.name === 'ts'), r.payload?.error);

    // --- validation
    r = await alter('ddl_test', [{op: 'addColumn', column: col('bad', 'int; DROP TABLE customers'), position: {kind: 'end'}}], true);
    check('statement break in type refused', r.message === 'QUERY_ERROR' && /not allowed/.test(r.payload.error), r.payload?.error);
    r = await alter('ddl_test', [{op: 'addColumn', column: col('bad', 'int /* x */'), position: {kind: 'end'}}], true);
    check('comment in type refused', r.message === 'QUERY_ERROR', r.payload?.error);
    r = await alter('ddl_test', [{op: 'addColumn', column: col('bad', 'varchar(10'), position: {kind: 'end'}}], true);
    check('unbalanced parentheses refused', r.message === 'QUERY_ERROR', r.payload?.error);
    r = await alter('ddl_test', [{op: 'addColumn', column: col('x`y', 'int'), position: {kind: 'end'}}], true);
    check('backtick in name escaped', r.payload?.statements?.[0]?.includes('`x``y`'), JSON.stringify(r.payload?.statements));
    r = await alter('ddl_test', [{op: 'addColumn', column: col('code', 'int'), position: {kind: 'end'}}]);
    check('sql error reported', r.message === 'QUERY_ERROR' && /Duplicate column/i.test(r.payload.error), r.payload?.error);
    r = await alter('ddl_test', []);
    check('empty alter refused', r.message === 'QUERY_ERROR', r.payload?.error);

    // --- rename, truncate, drop
    await select("INSERT INTO ddl_test (code) VALUES ('q')").catch(() => null);
    r = await change('ddl_test', {kind: 'rename', newName: 'ddl_test2'});
    check('rename', r.message === 'STRUCTURE_CHANGE_APPLIED' && (await structure('ddl_test')).message === 'QUERY_ERROR' && (await structure('ddl_test2')).message === 'TABLE_STRUCTURE', r.payload?.error);
    r = await change('ddl_test2', {kind: 'truncate'});
    check('truncate', r.message === 'STRUCTURE_CHANGE_APPLIED' && r.payload.statements[0] === 'TRUNCATE TABLE `shop`.`ddl_test2`', r.payload?.error);
    r = await change('ddl_test2', {kind: 'drop'}, true);
    check('drop preview keeps table', r.payload?.statements?.[0] === 'DROP TABLE `shop`.`ddl_test2`' && (await structure('ddl_test2')).message === 'TABLE_STRUCTURE');
    r = await change('ddl_test2', {kind: 'drop'});
    check('drop', r.message === 'STRUCTURE_CHANGE_APPLIED' && (await structure('ddl_test2')).message === 'QUERY_ERROR', r.payload?.error);
    r = await change('struct_test', {kind: 'rename', newName: ' '}, true);
    check('empty new name refused', r.message === 'QUERY_ERROR', r.payload?.error);

    ws.close();
    await fetch(`${BASE}/api/disconnect`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: user.token})});
  }
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
