// status, variables (change), advisor, character sets and engines of server: node server-test.js <baseUrl>
const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://php_flase:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const connect = async (connection, username, password) => {
  const user = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username, password}, connectionData: connection})})).json();
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws/${user.token}`);
  const messages = [];
  ws.on('message', (m) => messages.push(JSON.parse(m)));
  await new Promise((r) => ws.on('open', r));
  let seq = 0;
  const done = ['SERVER_STATUS', 'SERVER_VARIABLES', 'SERVER_INFO', 'SERVER_VARIABLE_PREVIEW', 'SERVER_VARIABLE_APPLIED', 'QUERY_ERROR'];
  const request = async (command, payload = {}) => {
    const tabId = 's' + (++seq);
    ws.send(JSON.stringify({connectionData: {user, connection}, command, payload: {...payload, tabId}}));
    for (let i = 0; i < 400; i++) {
      const m = messages.find((x) => x.payload?.tabId === tabId && done.includes(x.message));
      if (m) return {...m, error: m.message === 'QUERY_ERROR' ? m.payload.error : null};
      await sleep(30);
    }
    return {error: 'timeout'};
  };
  return {
    ws,
    status: (withAdvice = false) => request('GET_SERVER_STATUS', {withAdvice}),
    variables: () => request('GET_SERVER_VARIABLES'),
    info: () => request('GET_SERVER_INFO'),
    set: (name, value, dryRun = false, persist = false) => request('SET_SERVER_VARIABLE', {name, value, dryRun, persist}),
  };
};

const metric = (status, key) => status.payload?.metrics?.find((item) => item.key === key);
const variable = async (c, name) => (await c.variables()).payload?.variables?.find((item) => item.name === name);

const mysqlTests = async (dsn, isMaria) => {
  console.log(`\n=== ${dsn}`);
  const connection = {id: 'srv-' + dsn, dsn, username: 'root', displayName: dsn, changeConfirmationRequired: false};
  const c = await connect(connection, 'root', 'root');

  let r = await c.status();
  check('status: version, uptime, metrics', !!r.payload?.version && r.payload.uptime > 0 && metric(r, 'connections')?.value >= 1
    && metric(r, 'queries')?.kind === 'counter' && metric(r, 'bytesSent')?.unit === 'bytes' && metric(r, 'maxConnections')?.value > 0, r.error || JSON.stringify(r.payload?.metrics?.slice(0, 4)));
  check('status: raw status variables, no advice', r.payload.raw.some((x) => x.name === 'Uptime') && r.payload.advice === undefined, r.payload.raw.length);
  const first = metric(r, 'queries').value;
  await sleep(300);
  r = await c.status(true);
  check('counter grows', metric(r, 'queries').value > first, `${first} -> ${metric(r, 'queries').value}`);
  check('advice returned', Array.isArray(r.payload.advice) && r.payload.advice.every((x) => x.title && x.recommendation && ['info', 'warning', 'critical'].includes(x.severity)),
    JSON.stringify(r.payload.advice));
  check('advice: slow query log disabled', r.payload.advice.some((x) => x.variable === 'slow_query_log'), JSON.stringify(r.payload.advice?.map((x) => x.title)));

  r = await c.variables();
  const maxConnections = r.payload?.variables?.find((x) => x.name === 'max_connections');
  check('variables listed', r.payload?.variables?.length > 200 && Number(maxConnections?.value) > 0, r.error || r.payload?.variables?.length);
  if (isMaria) {
    check('MariaDB: editable flag, description, default, no persist', maxConnections.editable === true && !!maxConnections.description && maxConnections.defaultValue !== null
      && r.payload.supportsPersist === false && r.payload.variables.find((x) => x.name === 'version')?.editable === false, JSON.stringify(maxConnections));
    check('MariaDB: enum / boolean options', r.payload.variables.find((x) => x.name === 'slow_query_log')?.options?.join() === 'ON,OFF', JSON.stringify(r.payload.variables.find((x) => x.name === 'slow_query_log')));
  } else {
    check('MySQL: persist supported, source of variable', r.payload.supportsPersist === true && maxConnections.editable === null && !!maxConnections.source, JSON.stringify(maxConnections));
  }

  r = await c.info();
  check('info: charsets, collations, engines', r.payload?.charsets?.some((x) => x.name === 'utf8mb4' && x.maxLength === 4) && r.payload.collations.some((x) => x.name === 'utf8mb4_bin')
    && r.payload.engines.some((x) => x.name === 'InnoDB' && x.transactions === true) && r.payload.extensions === null, r.error || JSON.stringify(r.payload?.engines));

  // --- change of variable
  r = await c.set('max_connect_errors', '123', true);
  check('set preview', r.message === 'SERVER_VARIABLE_PREVIEW' && r.payload.statements[0] === 'SET GLOBAL max_connect_errors = 123', r.error || JSON.stringify(r.payload?.statements));
  r = await c.set('init_connect', "x'; DROP", true);
  check('string value escaped', r.payload?.statements?.[0] === "SET GLOBAL init_connect = 'x\\'; DROP'", r.error || r.payload?.statements?.[0]);
  r = await c.set('slow_query_log', 'on', true);
  check('keyword value', r.payload?.statements?.[0] === 'SET GLOBAL slow_query_log = ON', r.payload?.statements?.[0]);
  r = await c.set('max_connections; DROP', '1', true);
  check('invalid name refused', /Invalid variable name/.test(r.error || ''), r.error);
  r = await c.set('max_connect_errors', '123', true, true);
  check(isMaria ? 'persist refused in MariaDB' : 'persist preview', isMaria ? /PERSIST is not available/.test(r.error || '') : r.payload?.statements?.[0] === 'SET PERSIST max_connect_errors = 123', r.error || r.payload?.statements?.[0]);
  r = await c.set('max_connect_errors', '123');
  check('variable changed', r.message === 'SERVER_VARIABLE_APPLIED' && (await variable(c, 'max_connect_errors'))?.value === '123', r.error);
  r = await c.set('max_connect_errors', null);
  check('variable back to default', r.payload?.statements?.[0] === 'SET GLOBAL max_connect_errors = DEFAULT' && (await variable(c, 'max_connect_errors'))?.value === '100', r.error);
  r = await c.set('version', 'x');
  check('read only variable reports error', r.message === 'QUERY_ERROR' && /read only/i.test(r.error), r.error);

  const flase = await connect({...connection, id: 'srv-user-' + dsn, username: 'flase'}, 'flase', 'flase');
  r = await flase.set('max_connect_errors', '123');
  check('user without privilege gets error', r.message === 'QUERY_ERROR' && /privilege|denied/i.test(r.error), r.error);
  r = await flase.status();
  check('status readable without privileges', r.message === 'SERVER_STATUS', r.error);
  flase.ws.close();

  const readOnly = await connect({...connection, id: 'srv-ro-' + dsn, readOnly: true}, 'root', 'root');
  r = await readOnly.set('max_connect_errors', '123', true);
  check('read only: preview allowed', r.message === 'SERVER_VARIABLE_PREVIEW', r.error);
  r = await readOnly.set('max_connect_errors', '123');
  check('read only: change refused', /read only/i.test(r.error || ''), r.error);
  readOnly.ws.close();
  c.ws.close();
};

const postgresTests = async () => {
  console.log('\n=== postgresql');
  const connection = {id: 'srv-pg', dsn: 'postgresql://postgres:5432/shop', username: 'flase', displayName: 'pg', changeConfirmationRequired: false};
  const c = await connect(connection, 'flase', 'flase');

  let r = await c.status(true);
  check('status: version, uptime, metrics', /^\d+/.test(r.payload?.version || '') && r.payload.uptime > 0 && metric(r, 'connections')?.value >= 1
    && metric(r, 'transactions')?.kind === 'counter' && metric(r, 'cacheRequests')?.value > 0 && metric(r, 'maxConnections')?.value > 0, r.error || JSON.stringify(r.payload?.metrics));
  check('status: raw statistics', r.payload.raw.some((x) => x.name === 'pg_stat_database.xact_commit') && r.payload.raw.some((x) => x.name.startsWith('checkpoints.')), JSON.stringify(r.payload.raw.map((x) => x.name)));
  check('advice returned', Array.isArray(r.payload.advice), JSON.stringify(r.payload.advice));

  r = await c.variables();
  const workMem = r.payload?.variables?.find((x) => x.name === 'work_mem');
  const sharedBuffers = r.payload?.variables?.find((x) => x.name === 'shared_buffers');
  check('settings listed with units', workMem?.unit === 'kB' && !!workMem.display && !!workMem.description && workMem.editable === true && r.payload.persistentChanges === true, JSON.stringify(workMem));
  check('restart needed for shared_buffers', sharedBuffers?.needsRestart === true, JSON.stringify(sharedBuffers));
  check('options of enum and bool', r.payload.variables.find((x) => x.name === 'autovacuum')?.options?.join() === 'on,off'
    && r.payload.variables.find((x) => x.name === 'wal_level')?.options?.includes('replica'), JSON.stringify(r.payload.variables.find((x) => x.name === 'wal_level')?.options));
  check('internal settings not editable', r.payload.variables.find((x) => x.name === 'block_size')?.editable === false);

  r = await c.info();
  check('info: databases, extensions, collations, access methods', r.payload?.databases?.some((x) => x.name === 'shop' && x.encoding === 'UTF8')
    && r.payload.extensions.some((x) => x.name === 'plpgsql' && x.installed) && r.payload.collations.some((x) => x.name === 'C') && r.payload.engines.some((x) => x.name === 'heap'),
  r.error || JSON.stringify(r.payload?.databases));

  r = await c.set('work_mem', '8MB', true);
  check('ALTER SYSTEM preview', JSON.stringify(r.payload?.statements) === JSON.stringify([`ALTER SYSTEM SET "work_mem" = '8MB'`, 'SELECT pg_reload_conf()']), r.error || JSON.stringify(r.payload?.statements));
  r = await c.set('work_mem', '8MB');
  await sleep(500);
  check('setting changed and reloaded', r.message === 'SERVER_VARIABLE_APPLIED' && (await variable(c, 'work_mem'))?.display === '8MB', r.error || JSON.stringify(await variable(c, 'work_mem')));
  r = await c.set('work_mem', null);
  await sleep(500);
  check('setting reset', r.payload?.statements?.[0] === 'ALTER SYSTEM RESET "work_mem"' && (await variable(c, 'work_mem'))?.display === '4MB', r.error || JSON.stringify(await variable(c, 'work_mem')));
  r = await c.set('work_mem', '1', false, true);
  check('persist option refused', /not needed/.test(r.error || ''), r.error);
  r = await c.set('work_mem', 'lots');
  check('invalid value reports error', r.message === 'QUERY_ERROR' && /invalid value/i.test(r.error), r.error);
  c.ws.close();
};

(async () => {
  await mysqlTests('mysql://mariadb', true);
  await mysqlTests('mysql://mysql', false);
  await postgresTests();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
