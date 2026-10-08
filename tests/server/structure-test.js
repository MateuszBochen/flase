// table structure: node structure-test.js <baseUrl>
const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://php_flase:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (const dsn of ['mysql://mariadb', 'mysql://mysql']) {
    console.log(`\n=== ${dsn}`);
    const connection = {id: 's-' + dsn, dsn, username: 'flase', displayName: dsn, changeConfirmationRequired: false};
    const user = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();
    const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws/${user.token}`);
    const messages = [];
    ws.on('message', (m) => messages.push(JSON.parse(m)));
    await new Promise((r) => ws.on('open', r));
    let seq = 0;
    const structure = async (name, database = 'shop') => {
      const tabId = 'st' + (++seq);
      ws.send(JSON.stringify({connectionData: {user, connection}, command: 'GET_TABLE_STRUCTURE', payload: {tabId, table: {databaseName: database, name}}}));
      for (let i = 0; i < 100; i++) {
        const m = messages.find((x) => x.payload?.tabId === tabId);
        if (m) return m;
        await sleep(50);
      }
      return {};
    };

    const m = await structure('struct_test');
    const s = m.payload;
    check('structure message', m.message === 'TABLE_STRUCTURE', m.payload?.error);
    check('no warnings', s.warnings.length === 0, s.warnings.join(' | '));
    check('info', s.info.engine === 'InnoDB' && s.info.comment === 'structure test' && s.info.autoIncrement === 3 && s.info.rows >= 0 && s.info.dataLength > 0, JSON.stringify(s.info));
    check('columns in order', s.columns.map((c) => c.name).join() === 'id,code,customer_id,status,title,created,total,total_x2', s.columns.map((c) => c.name).join());
    const col = Object.fromEntries(s.columns.map((c) => [c.name, c]));
    check('column details', /^int(\(10\))? unsigned$/.test(col.id.type) && col.id.extra.includes('auto_increment') && col.id.key === 'PRI' && !col.id.nullable, JSON.stringify(col.id));
    check('comment', col.code.comment === 'business code');
    check('string default with apostrophe unquoted', col.title.defaultValue === "it's untitled", JSON.stringify(col.title.defaultValue));
    check('null default', col.customer_id.defaultValue === null && col.customer_id.nullable);
    check('expression default', /current_timestamp/i.test(col.created.defaultValue), col.created.defaultValue);
    check('generated column extra', /VIRTUAL/i.test(col.total_x2.extra), col.total_x2.extra);
    check('default kinds', col.created.defaultIsExpression && !col.status.defaultIsExpression && !col.title.defaultIsExpression && !col.total.defaultIsExpression && !col.code.defaultIsExpression,
      JSON.stringify(s.columns.map((c) => [c.name, c.defaultIsExpression])));
    check('generation expression', /total.*\*\s*2/.test(col.total_x2.generationExpression || ''), col.total_x2.generationExpression);
    const idx = Object.fromEntries(s.indexes.map((i) => [i.name, i]));
    check('indexes', idx.PRIMARY?.primary && idx.uq_code?.unique && !idx.idx_title_status?.unique, Object.keys(idx).join());
    check('composite index with prefix', JSON.stringify(idx.idx_title_status?.columns.map((c) => [c.name, c.subPart])) === '[["title",10],["status",null]]', JSON.stringify(idx.idx_title_status?.columns));
    const fk = s.foreignKeys[0];
    check('foreign key', s.foreignKeys.length >= 1 && fk.name === 'fk_struct_customer' && fk.columns.join() === 'customer_id' && fk.referencedTable.name === 'customers' && fk.onDelete === 'SET NULL' && fk.onUpdate === 'CASCADE', JSON.stringify(s.foreignKeys));
    check('referenced by', s.referencedBy.length === 1 && s.referencedBy[0].table.name === 'struct_child' && s.referencedBy[0].columns.join() === 'struct_id', JSON.stringify(s.referencedBy));
    check('trigger', s.triggers.length === 1 && s.triggers[0].name === 'trg_struct_code' && s.triggers[0].timing === 'BEFORE' && s.triggers[0].event === 'INSERT', JSON.stringify(s.triggers));
    check('ddl', s.ddl.startsWith('CREATE TABLE `struct_test`') && s.ddl.includes('fk_struct_customer'), s.ddl.slice(0, 40));

    const v = (await structure('struct_view')).payload;
    check('view: type and ddl', /VIEW/.test(v.info.type) && /CREATE .*VIEW/i.test(v.ddl) && v.columns.length === 2, `${v.info?.type} ${v.ddl?.slice(0, 40)}`);
    check('view: no warnings', v.warnings.length === 0, v.warnings.join(' | '));

    const missing = await structure('nope_table');
    check('missing table -> error', missing.message === 'QUERY_ERROR' && /does not exist/.test(missing.payload.error), missing.payload?.error);

    ws.close();
    await fetch(`${BASE}/api/disconnect`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: user.token})});
  }
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
