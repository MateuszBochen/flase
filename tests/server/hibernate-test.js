// PostgreSQL database with tables of Hibernate / Flyway (tests/fixtures/postgres-hibernate.sql),
// connection without database in DSN: node hibernate-test.js <baseUrl>
const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://php_flase:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // like postgresql://host:5432 of application user - database named as the user is opened
  const connection = {id: 'hb', dsn: 'postgresql://postgres:5432', username: 'flase_owner', displayName: 'hibernate', changeConfirmationRequired: false};
  const user = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase_owner', password: 'flase'}, connectionData: connection})})).json();
  check('login without database in DSN', !!user.token, JSON.stringify(user));
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws/${user.token}`);
  const messages = [];
  ws.on('message', (m) => messages.push(JSON.parse(m)));
  await new Promise((r) => ws.on('open', r));
  let seq = 0;
  const done = ['QUERY_FINISHED', 'QUERY_ERROR', 'TABLE_STRUCTURE', 'ROW_CHANGES_APPLIED', 'ROW_CHANGES_PREVIEW', 'DATABASE_OBJECTS'];
  const request = async (command, payload) => {
    const tabId = 'h' + (++seq);
    ws.send(JSON.stringify({connectionData: {user, connection}, command, payload: {...payload, tabId}}));
    for (let i = 0; i < 400; i++) {
      const m = messages.find((x) => x.payload?.tabId === tabId && done.includes(x.message));
      if (m) {
        await sleep(30);
        const all = messages.filter((x) => x.payload?.tabId === tabId);
        return {...m, error: m.message === 'QUERY_ERROR' ? m.payload.error : null,
          columns: all.find((x) => x.message === 'SINGLE_SELECT_COLUMN')?.payload || null,
          rows: all.filter((x) => x.message === 'SINGLE_SELECT_RECORD').map((x) => x.payload.rowDataValue)};
      }
      await sleep(30);
    }
    return {error: 'timeout'};
  };
  const select = (query) => request('SEND_SELECT_QUERY', {query, database: {name: 'public'}});
  const apply = (table, changes) => request('APPLY_ROW_CHANGES', {database: {name: 'public'}, table: {databaseName: 'public', name: table}, changes, dryRun: false});

  // --- tables of database of the user
  let r = await request('GET_DATABASE_OBJECTS', {database: 'public'});
  const names = (r.payload?.tables || []).map((table) => table.name);
  check('database of user with Hibernate tables', r.payload?.catalog === 'flase_owner' && names.length === 10
    && ['app_users', 'attachments', 'comments', 'flyway_schema_history', 'invoices', 'project_tags', 'projects', 'release_tickets', 'releases', 'tickets'].every((name) => names.includes(name)), r.error || names.join());
  const start = messages.length;
  ws.send(JSON.stringify({connectionData: {user, connection}, command: 'RELOAD_TABLES_LIST', payload: {name: 'public'}}));
  await sleep(1500);
  const listed = messages.slice(start).filter((m) => m.message === 'TABLE_BASE_ITEM' && !m.payload.preload);
  const ticketsInfo = listed.find((m) => m.payload.tableName === 'tickets')?.payload;
  check('sidebar list of tables', new Set(listed.map((m) => m.payload.tableName)).size === 10, listed.length);
  check('uuid key and foreign keys with Hibernate names', ticketsInfo?.primaryColumns?.[0]?.name === 'id'
    && ticketsInfo.columns.find((column) => column.name === 'project_id')?.reference?.constraintName === 'fk6bnpvjr3tuj3vy7m4t2k3e1wq'
    && ticketsInfo.columns.find((column) => column.name === 'parent_id')?.reference?.table.name === 'tickets', JSON.stringify(ticketsInfo?.columns?.find((column) => column.name === 'project_id')));

  // --- every table can be read
  for (const name of names) {
    r = await select(`SELECT * FROM "${name}" LIMIT 100 OFFSET 0`);
    check(`select ${name}`, r.message === 'QUERY_FINISHED' && r.rows.length > 0, r.error);
  }

  // --- values of Hibernate types
  r = await select('SELECT * FROM tickets LIMIT 100 OFFSET 0');
  const first = r.rows.find((row) => row.key === 'FL-1');
  check('jsonb, timestamptz(6), double', /"points": 5/.test(first?.custom_fields) && /^2026-09-01 09:00:00\+00/.test(first?.created_at) && String(first?.estimate) === '8.5', JSON.stringify(first));
  check('generated tsvector is read only', r.columns?.columns?.find((column) => column.name === 'search_vector')?.editable === false && r.columns.editable?.primaryKey?.join() === 'id',
    JSON.stringify(r.columns?.columns?.find((column) => column.name === 'search_vector')));
  r = await select('SELECT * FROM invoices ORDER BY id LIMIT 100 OFFSET 0');
  check('numeric(38,2) without rounding, bigint key from sequence', r.rows[1]?.amount === '99999999999999999999.99' && String(r.rows[1]?.id) === '51', JSON.stringify(r.rows));
  r = await select('SELECT * FROM attachments LIMIT 100 OFFSET 0');
  check('bytea of @Lob and empty oid', r.rows[0]?.content?.binary === true && r.rows[0].content.text === 'first notes' && r.rows[0].content_oid === null, JSON.stringify(r.rows[0]));

  // --- structure: check constraints of enums and generated column in DDL
  r = await request('GET_TABLE_STRUCTURE', {table: {databaseName: 'public', name: 'projects'}});
  check('structure with check constraint of enum', /"projects_status_check" CHECK \(status::text = ANY/.test(r.payload?.ddl || '') && r.payload.indexes.some((index) => index.name === 'idx_projects_search_vector')
    && r.payload.columns.find((column) => column.name === 'search_vector')?.generationExpression, r.error || r.payload?.ddl?.slice(0, 300));
  r = await request('GET_TABLE_STRUCTURE', {table: {databaseName: 'public', name: 'tickets'}});
  check('foreign keys and self reference', r.payload?.foreignKeys?.map((key) => key.name).sort().join() === 'fk6bnpvjr3tuj3vy7m4t2k3e1wq,fk_tickets_author,fkqbm0ta6y9o2y3rh8w0yt2krq1'
    && r.payload.referencedBy.some((key) => key.table.name === 'release_tickets'), JSON.stringify(r.payload?.foreignKeys?.map((key) => key.name)));

  // --- editing: uuid key, jsonb, check constraint, join table without primary key
  r = await apply('projects', [{kind: 'update', where: {id: '3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01'}, values: {settings: '{"color": "#d9534f"}'}}]);
  check('update jsonb by uuid key', r.message === 'ROW_CHANGES_APPLIED', r.error);
  r = await apply('projects', [{kind: 'update', where: {id: '3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01'}, values: {status: 'UNKNOWN'}}]);
  check('value outside of enum refused by check constraint', r.message === 'QUERY_ERROR' && /projects_status_check/.test(r.error), r.error);
  r = await apply('release_tickets', [{kind: 'delete', where: {release_id: 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02', ticket_id: 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02'}, limitOne: true}]);
  check('delete in join table without primary key', r.message === 'ROW_CHANGES_APPLIED', r.error);
  r = await apply('release_tickets', [{kind: 'insert', values: {release_id: 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02', ticket_id: 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c02'}}]);
  check('insert in join table', r.message === 'ROW_CHANGES_APPLIED', r.error);
  r = await apply('comments', [{kind: 'insert', values: {id: 'd1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c99', ticket_id: 'c1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c09', body: 'x', created_at: '2026-10-12 05:00:00+00'}}]);
  check('foreign key with Hibernate name reported', r.message === 'QUERY_ERROR' && /fkb6hxs6fnjoyl2pl9r93mxhcod/.test(r.error), r.error);

  ws.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
