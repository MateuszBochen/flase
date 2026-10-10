// token refresh: node refresh-test.js <baseUrl>, server must run with JWT_TOKEN_EXPIRE=20s
const WebSocket = require('ws');
const BASE = process.argv[2];
const WS_BASE = BASE.replace('http', 'ws');

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const payload = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  return {status: res.status, body: await res.json().catch(() => null)};
};
const connection = {id: 'refresh', dsn: 'mysql://mariadb', username: 'flase', displayName: 'r', changeConfirmationRequired: false};

const openWs = (token) => new Promise((resolve) => {
  const ws = new WebSocket(`${WS_BASE}/ws/${token}`);
  const state = {ws, messages: [], closed: null, opened: false};
  ws.on('message', (m) => state.messages.push(JSON.parse(m)));
  ws.on('open', () => { state.opened = true; setTimeout(() => resolve(state), 300); });
  ws.on('close', (code) => { state.closed = code; resolve(state); });
});
const query = async (state, user) => {
  const tabId = 't' + Math.random();
  state.ws.send(JSON.stringify({connectionData: {user, connection}, command: 'SEND_SELECT_QUERY',
    payload: {query: 'SELECT COUNT(*) AS n FROM categories', database: {name: 'shop'}, tabId}}));
  for (let i = 0; i < 100; i++) {
    const done = state.messages.find((m) => m.payload?.tabId === tabId && (m.message === 'QUERY_FINISHED' || m.message === 'QUERY_ERROR'));
    if (done) return done.message;
    await sleep(50);
  }
  return 'timeout';
};

(async () => {
  const login = await post('/api/login', {userData: {username: 'flase', password: 'flase'}, connectionData: connection});
  const tokenA = login.body.token;
  const a = payload(tokenA);
  check('token has sessionId and short expiry', !!a.sessionId && a.exp - a.iat === 20, JSON.stringify(a));

  const wsA = await openWs(tokenA);
  check('websocket with token A', wsA.opened && !wsA.closed);

  await sleep(1100); // new iat
  const refreshB = await post('/api/refresh', {token: tokenA});
  const tokenB = refreshB.body?.token;
  check('refresh returns new token', refreshB.status === 200 && tokenB && tokenB !== tokenA, JSON.stringify(refreshB));
  check('same session, later expiry', payload(tokenB).sessionId === a.sessionId && payload(tokenB).exp > a.exp);

  check('websocket opened with old token still works after refresh', await query(wsA, {token: tokenB, username: 'flase'}) === 'QUERY_FINISHED');

  check('refresh with invalid token -> 401', (await post('/api/refresh', {token: 'nope'})).status === 401);
  check('refresh without body -> 401', (await post('/api/refresh', {})).status === 401);

  await sleep(12000);
  const refreshC = await post('/api/refresh', {token: tokenB});
  const tokenC = refreshC.body?.token;
  check('second refresh', refreshC.status === 200 && payload(tokenC).sessionId === a.sessionId);

  await sleep(9000); // token A expired now (21s+), B soon, C valid
  check('token A expired', Date.now() / 1000 > a.exp, `${Date.now() / 1000} > ${a.exp}`);
  const wsOld = await openWs(tokenA);
  check('websocket with expired token closed 4001', wsOld.closed === 4001, String(wsOld.closed));
  check('refresh with expired token -> 401', (await post('/api/refresh', {token: tokenA})).status === 401);

  const wsC = await openWs(tokenC);
  check('expired token did not close refreshed session', wsC.opened && !wsC.closed && await query(wsC, {token: tokenC, username: 'flase'}) === 'QUERY_FINISHED');
  check('first websocket still alive', await query(wsA, {token: tokenC, username: 'flase'}) === 'QUERY_FINISHED');

  // logout with current token closes session
  await post('/api/disconnect', {token: tokenC});
  const wsAfterLogout = await openWs(tokenC);
  check('after disconnect session is gone', wsAfterLogout.closed === 4001, String(wsAfterLogout.closed));
  check('refresh after disconnect -> 401', (await post('/api/refresh', {token: tokenC})).status === 401);

  [wsA, wsC].forEach((s) => s.ws.close());
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
