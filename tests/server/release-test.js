// idle connection release: node release-test.js   (NODE_PATH=server/node_modules, network flase_default)
const WebSocket = require('ws');
const mysql = require('mysql');
const BASE = 'http://php_flase:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const root = mysql.createConnection({host: 'mariadb', user: 'root', password: 'root'});
const dbConnections = () => new Promise((resolve) => root.query(
  "SELECT COUNT(*) AS n FROM information_schema.PROCESSLIST WHERE USER = 'flase'", (e, r) => resolve(r[0].n)));

const connection = {id: 'rel', dsn: 'mysql://mariadb', username: 'flase', displayName: 'rel', changeConfirmationRequired: false};
const login = async () => (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();

const openAndQuery = async (user) => {
  const ws = new WebSocket(`ws://php_flase:3001/ws/${user.token}`);
  const messages = [];
  ws.on('message', (m) => messages.push(JSON.parse(m)));
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({connectionData: {user, connection}, command: 'SEND_SELECT_QUERY',
    payload: {query: 'SELECT COUNT(*) AS n FROM customers', database: {name: 'shop'}, tabId: 'r' + Date.now()}}));
  for (let i = 0; i < 100 && !messages.some((m) => m.message === 'QUERY_FINISHED' || m.message === 'QUERY_ERROR'); i++) await sleep(50);
  const done = messages.find((m) => m.message === 'QUERY_FINISHED' || m.message === 'QUERY_ERROR');
  return {ws, done, row: messages.find((m) => m.message === 'SINGLE_SELECT_RECORD')?.payload.rowDataValue};
};

(async () => {
  const start = await dbConnections();
  const user = await login();

  let r = await openAndQuery(user);
  check('query works', r.done?.message === 'QUERY_FINISHED' && String(r.row?.n) === '200', JSON.stringify(r.row));
  const open = await dbConnections();
  check('connections open while websocket is open', open > start, `start=${start} open=${open}`);

  r.ws.close();
  await sleep(5000);
  check('still open shortly after close (page reload)', await dbConnections() > start);

  await sleep(30000);
  const released = await dbConnections();
  check('released 30s after websocket closed', released === start, `released=${released} start=${start}`);

  r = await openAndQuery(user);
  check('same login works again after release', r.done?.message === 'QUERY_FINISHED' && String(r.row?.n) === '200', r.done?.payload?.error || JSON.stringify(r.row));
  check('pool opened again', await dbConnections() > start);
  r.ws.close();

  // login without websocket
  await login();
  await sleep(36000);
  check('login without websocket released', await dbConnections() === start, String(await dbConnections()));

  root.end();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
