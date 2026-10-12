// many queries of one session at the same time (application in two windows restores the same tabs):
// pool of connections must not deadlock - node pool-test.js <baseUrl>
const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://php_flase:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const open = async (connection, password = 'flase') => {
  const user = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: connection.username, password}, connectionData: connection})})).json();
  const sockets = [];
  const messages = [];
  const socket = async () => {
    const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws/${user.token}`);
    ws.on('message', (m) => messages.push(JSON.parse(m)));
    await new Promise((r) => ws.on('open', r));
    sockets.push(ws);
    return ws;
  };
  const wait = async (tabId, done, ms = 15000) => {
    for (let i = 0; i < ms / 30; i++) {
      const m = messages.find((x) => x.payload?.tabId === tabId && done.includes(x.message));
      if (m) return m;
      await sleep(30);
    }
    return {message: 'timeout'};
  };
  return {user, socket, wait, close: () => sockets.forEach((ws) => ws.close())};
};

const run = async (name, connection, database, tables) => {
  const session = await open(connection);
  // two windows - two websockets of the same session, the same tab ids
  const windows = [await session.socket(), await session.socket()];
  const tabIds = [];
  windows.forEach((ws, w) => {
    for (let i = 0; i < 6; i++) {
      const tabId = `${name}-tab-${i}`;
      const table = tables[i % tables.length];
      ws.send(JSON.stringify({connectionData: {user: session.user, connection}, command: 'SEND_SELECT_QUERY',
        payload: {query: `SELECT * FROM ${table} LIMIT 100 OFFSET 0`, database: {name: database}, tabId}}));
      ws.send(JSON.stringify({connectionData: {user: session.user, connection}, command: 'GET_TABLE_STRUCTURE',
        payload: {table: {databaseName: database, name: table}, tabId: `${tabId}-s${w}`}}));
      tabIds.push(`${tabId}-s${w}`);
    }
  });
  const started = Date.now();
  const results = await Promise.all([
    ...Array.from({length: 6}, (_, i) => session.wait(`${name}-tab-${i}`, ['QUERY_FINISHED', 'QUERY_ERROR'])),
    ...tabIds.map((tabId) => session.wait(tabId, ['TABLE_STRUCTURE', 'QUERY_ERROR'])),
  ]);
  const stuck = results.filter((r) => r.message === 'timeout').length;
  check(`${name}: 24 commands of two windows at once finish`, stuck === 0, `${stuck} without answer after ${Date.now() - started} ms`);

  // SQL consoles of both windows at once - every statement loads structure of its tables
  windows.forEach((ws, w) => {
    for (let i = 0; i < 6; i++) {
      ws.send(JSON.stringify({connectionData: {user: session.user, connection}, command: 'EXECUTE_STATEMENTS',
        payload: {statements: tables.map((table) => `SELECT * FROM ${table} LIMIT 5`), database, tabId: `${name}-console-${w}-${i}`}}));
    }
  });
  const consoles = await Promise.all(windows.flatMap((_, w) => Array.from({length: 6}, (__, i) => session.wait(`${name}-console-${w}-${i}`, ['EXECUTION_FINISHED']))));
  check(`${name}: 12 consoles at once finish`, consoles.every((r) => r.message === 'EXECUTION_FINISHED' && r.payload.failed === 0), JSON.stringify(consoles.find((r) => r.message !== 'EXECUTION_FINISHED' || r.payload.failed)));

  // session still works afterwards
  windows[0].send(JSON.stringify({connectionData: {user: session.user, connection}, command: 'SEND_SELECT_QUERY',
    payload: {query: `SELECT * FROM ${tables[0]} LIMIT 1 OFFSET 0`, database: {name: database}, tabId: `${name}-after`}}));
  check(`${name}: session works afterwards`, (await session.wait(`${name}-after`, ['QUERY_FINISHED', 'QUERY_ERROR'], 10000)).message === 'QUERY_FINISHED');
  session.close();
};

(async () => {
  await run('pg', {id: 'pool-pg', dsn: 'postgresql://postgres:5432/shop', username: 'flase', displayName: 'pg', changeConfirmationRequired: false}, 'public', ['products', 'customers', 'orders']);
  await run('maria', {id: 'pool-maria', dsn: 'mysql://mariadb', username: 'flase', displayName: 'maria', changeConfirmationRequired: false}, 'shop', ['products', 'customers', 'orders']);

  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
