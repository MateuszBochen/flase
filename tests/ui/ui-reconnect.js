// reconnect + token refresh UI test. Front on :3000, test server (JWT 20s) on :3002.
// Browser talks to localhost:3001 - HTTP is redirected to :3002, websocket goes through proxy below.
const {chromium} = require('playwright');
const WebSocket = require('ws');
const OUT = process.env.SHOTS || '/pw/shots';
const TEST_SERVER = 'localhost:3002';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const payload = (token) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

(async () => {
  const connection = {id: 'reconnect', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Reconnect test', changeConfirmationRequired: false};
  const res = await fetch(`http://${TEST_SERVER}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})});
  const user = await res.json();
  const firstToken = user.token;

  const browser = await chromium.launch();
  const page = await browser.newPage({viewport: {width: 1400, height: 800}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // --- HTTP redirect, count refresh calls
  let refreshCalls = 0;
  await page.route('http://localhost:3001/**', async (route) => {
    if (route.request().url().includes('/api/refresh')) refreshCalls++;
    await route.continue({url: route.request().url().replace('localhost:3001', TEST_SERVER)});
  });

  // --- websocket proxy: can drop connections and block reconnect
  let blocked = false;
  let wsConnections = 0;
  const sockets = [];
  await page.routeWebSocket(/ws:\/\/localhost:3001\/.*/, (browserWs) => {
    wsConnections++;
    if (blocked) {
      browserWs.close({code: 1006 === 1006 ? 1011 : 1011, reason: 'blocked'});
      return;
    }
    const upstream = new WebSocket(browserWs.url().replace('localhost:3001', TEST_SERVER));
    const pending = [];
    upstream.on('open', () => pending.splice(0).forEach((m) => upstream.send(m)));
    browserWs.onMessage((m) => upstream.readyState === WebSocket.OPEN ? upstream.send(m) : pending.push(m));
    upstream.on('message', (m) => browserWs.send(m.toString()));
    upstream.on('close', (code, reason) => browserWs.close({code, reason: reason.toString()}));
    browserWs.onClose(() => upstream.close());
    sockets.push({browserWs, upstream});
  });
  /** like network drop - browser gets 1011, server sees closed socket */
  const dropConnection = () => {
    sockets.splice(0).forEach(({browserWs, upstream}) => {
      browserWs.close({code: 1011, reason: 'network'});
      upstream.terminate();
    });
  };
  const toasts = async () => (await page.locator('[role="status"]').allInnerTexts()).join(' | ');

  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
  }, [connection, user]);
  await page.reload();
  await page.waitForTimeout(1500);
  await page.getByText('Reconnect test', {exact: true}).first().click();
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(800);
  await page.getByText('categories', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  const grid = page.locator('.cmp-records-view').last();
  const rows = grid.locator('.data-table-row');
  check('table loaded through proxy', await rows.count() === 5, String(await rows.count()));
  const runQuery = async (sql) => {
    await page.locator('.monaco-editor').last().click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(sql);
    await page.keyboard.press('Enter');
  };

  // --- 1. connection drop -> automatic reconnect
  const before = wsConnections;
  dropConnection();
  await page.waitForTimeout(300);
  check('lost toast shown', /Connection to server lost/.test(await toasts()), await toasts());
  await page.waitForTimeout(1500);
  check('reconnected', wsConnections === before + 1 && /Reconnected to server/.test(await toasts()), `${wsConnections} ${await toasts()}`);
  await runQuery('SELECT * FROM categories WHERE id <= 2');
  await page.waitForTimeout(1200);
  check('query works after reconnect', await rows.count() === 2, String(await rows.count()));

  // --- 2. query while server is unreachable is queued and sent after reconnect
  blocked = true;
  dropConnection();
  await page.waitForTimeout(300);
  await runQuery('SELECT * FROM categories WHERE id <= 3');
  await page.waitForTimeout(2500);
  check('no result while disconnected', await grid.locator('.pager-loading').count() === 1);
  blocked = false;
  await page.waitForTimeout(6000); // backoff 1s, 2s, 5s
  check('queued query sent after reconnect', await rows.count() === 3, `${await rows.count()} rows, ${wsConnections} connections`);

  // --- 3. query in flight when connection drops -> tab is told, not stuck
  await runQuery('SELECT SLEEP(3) AS s, id FROM categories LIMIT 1');
  await page.waitForTimeout(500);
  dropConnection();
  await page.waitForTimeout(500);
  const message = await grid.locator('.cmp-records-view-message-error').innerText().catch(() => '');
  check('in-flight query reports lost connection', /Connection to server was lost/.test(message) && await grid.locator('.pager-loading').count() === 0, message);
  await page.waitForTimeout(2000);
  await page.screenshot({path: `${OUT}/51-reconnected.png`});

  // --- 4. token refresh (JWT 20s, refreshed 10s before expiry)
  await page.waitForTimeout(12000);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('established_connections')));
  const currentToken = Object.values(stored)[0].user.token;
  check('token refreshed', refreshCalls >= 1 && currentToken !== firstToken, `calls=${refreshCalls}`);
  check('refreshed token belongs to same session', payload(currentToken).sessionId === payload(firstToken).sessionId);
  await page.waitForTimeout(Math.max(0, payload(firstToken).exp * 1000 - Date.now()) + 1000);
  check('first token expired now', Date.now() > payload(firstToken).exp * 1000);
  const beforeReconnect = wsConnections;
  dropConnection();
  await page.waitForTimeout(2000);
  await runQuery('SELECT * FROM categories');
  await page.waitForTimeout(1500);
  check('reconnect after first token expired uses refreshed token', wsConnections === beforeReconnect + 1 && await rows.count() === 5, `${await rows.count()} rows`);

  // --- 5. session gone on server (e.g. restart) -> no endless reconnecting, user is told to log in
  const latest = Object.values(await page.evaluate(() => JSON.parse(localStorage.getItem('established_connections'))))[0].user.token;
  await fetch(`http://${TEST_SERVER}/api/disconnect`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: latest})});
  const beforeGone = wsConnections;
  dropConnection();
  await page.waitForTimeout(8000);
  check('session gone: at most one reconnect attempt, then stop', wsConnections - beforeGone <= 1, `${wsConnections - beforeGone} attempts`);
  check('session gone: log in message', /log in again/.test(await toasts()), await toasts());
  const storedAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('established_connections')));
  check('session gone: established connection removed', Object.keys(storedAfter).length === 0, JSON.stringify(storedAfter));
  await page.screenshot({path: `${OUT}/52-session-gone.png`});

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
