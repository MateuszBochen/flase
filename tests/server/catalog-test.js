// databases of PostgreSQL server above schemas - list and session of chosen database: node catalog-test.js <baseUrl>
const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://php_flase:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = async (url, body) => {
  const response = await fetch(`${BASE}${url}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  return {status: response.status, body: await response.json().catch(() => null)};
};

const open = async (user, connection) => {
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws/${user.token}`);
  const messages = [];
  ws.on('message', (m) => messages.push(JSON.parse(m)));
  await new Promise((r) => ws.on('open', r));
  let seq = 0;
  const request = async (command, payload = {}) => {
    const tabId = 'k' + (++seq);
    ws.send(JSON.stringify({connectionData: {user, connection}, command, payload: {...payload, tabId}}));
    for (let i = 0; i < 300; i++) {
      const m = messages.find((x) => x.payload?.tabId === tabId && ['CATALOGS', 'DATABASE_OBJECTS', 'QUERY_ERROR'].includes(x.message));
      if (m) return {...m, error: m.message === 'QUERY_ERROR' ? m.payload.error : null};
      await sleep(30);
    }
    return {error: 'timeout'};
  };
  return {ws, request};
};

(async () => {
  const connection = {id: 'cat', dsn: 'postgresql://postgres:5432', username: 'flase', displayName: 'catalogs', changeConfirmationRequired: false};
  const login = await post('/api/login', {userData: {username: 'flase', password: 'flase'}, connectionData: connection});
  check('login without database', login.status === 200 && !!login.body?.token, JSON.stringify(login.body));
  const parent = await open(login.body, connection);

  let r = await parent.request('GET_CATALOGS');
  const catalogs = r.payload?.catalogs || [];
  check('databases of server', ['flase_owner', 'postgres', 'shop'].every((name) => catalogs.some((item) => item.name === name && item.canConnect && item.size > 0))
    && catalogs.find((item) => item.current)?.name === 'postgres' && !catalogs.some((item) => /^template/.test(item.name)), r.error || JSON.stringify(catalogs));

  // session of other database with the same login
  let child = await post('/api/login/database', {token: login.body.token, database: 'flase_owner'});
  check('session of chosen database', child.status === 200 && !!child.body?.token && child.body.token !== login.body.token, JSON.stringify(child.body));
  const childConnection = {...connection, id: 'cat::flase_owner', catalog: 'flase_owner', parentId: 'cat'};
  const opened = await open(child.body, childConnection);
  r = await opened.request('GET_DATABASE_OBJECTS', {database: 'public'});
  check('schemas and tables of chosen database', r.payload?.catalog === 'flase_owner' && r.payload.tables.some((table) => table.name === 'tickets'), r.error || r.payload?.catalog);
  r = await parent.request('GET_DATABASE_OBJECTS', {database: 'public'});
  check('parent session stays in its database', r.payload?.catalog === 'postgres', r.payload?.catalog);
  opened.ws.close();

  child = await post('/api/login/database', {token: login.body.token, database: 'nope_db'});
  check('missing database reported', child.status === 401 && /does not exist/.test(child.body?.error || ''), JSON.stringify(child.body));
  child = await post('/api/login/database', {token: 'invalid', database: 'shop'});
  check('invalid token refused', child.status === 401, JSON.stringify(child.body));
  child = await post('/api/login/database', {token: login.body.token, database: ''});
  check('empty name refused', child.status === 400, JSON.stringify(child.body));

  const maria = {id: 'cat-maria', dsn: 'mysql://mariadb', username: 'flase', displayName: 'maria', changeConfirmationRequired: false};
  const mariaLogin = await post('/api/login', {userData: {username: 'flase', password: 'flase'}, connectionData: maria});
  child = await post('/api/login/database', {token: mariaLogin.body.token, database: 'shop'});
  check('MySQL has no databases above schemas', child.status === 400, JSON.stringify(child.body));
  const mariaWs = await open(mariaLogin.body, maria);
  r = await mariaWs.request('GET_CATALOGS');
  check('MySQL catalogs refused', r.message === 'QUERY_ERROR', r.error);
  mariaWs.ws.close();
  parent.ws.close();

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
