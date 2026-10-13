// icon of connection: blinks while connection to server is lost and can be clicked to reconnect at once
// Front on :3000, server on :3001 - websocket goes through proxy below, so it can be dropped and blocked.
const {chromium} = require('playwright');
const WebSocket = require('ws');
const OUT = process.env.SHOTS || '/pw/shots';
const SERVER = 'localhost:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};

(async () => {
  const connection = {id: 'state', dsn: 'mysql://mariadb', username: 'flase', displayName: 'State test', changeConfirmationRequired: false};
  const res = await fetch(`http://${SERVER}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})});
  const user = await res.json();

  const browser = await chromium.launch();
  const page = await browser.newPage({viewport: {width: 1400, height: 800}});
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  let blocked = false;
  let wsConnections = 0;
  const sockets = [];
  await page.routeWebSocket(/ws:\/\/localhost:3001\/.*/, (browserWs) => {
    wsConnections++;
    if (blocked) {
      browserWs.close({code: 1011, reason: 'blocked'});
      return;
    }
    const upstream = new WebSocket(browserWs.url());
    const pending = [];
    upstream.on('open', () => pending.splice(0).forEach((m) => upstream.send(m)));
    browserWs.onMessage((m) => upstream.readyState === WebSocket.OPEN ? upstream.send(m) : pending.push(m));
    upstream.on('message', (m) => browserWs.send(m.toString()));
    upstream.on('close', (code, reason) => browserWs.close({code, reason: reason.toString()}));
    browserWs.onClose(() => upstream.close());
    sockets.push({browserWs, upstream});
  });
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
  // buttons of connection are shown when it is expanded
  await page.getByText('State test', {exact: true}).first().click();
  await page.waitForTimeout(300);

  const icon = page.locator('.invisible-button-root:has(svg.fa-satellite-dish)').first();
  const state = async () => ({
    className: await icon.getAttribute('class'),
    disabled: await icon.isDisabled(),
    animation: await icon.locator('svg').evaluate((svg) => getComputedStyle(svg).animationName),
  });

  let s = await state();
  check('connected: blue, not clickable', /is-connect/.test(s.className) && s.disabled && s.animation === 'none', JSON.stringify(s));

  // --- connection lost, server unreachable: icon blinks and can be clicked
  blocked = true;
  dropConnection();
  await page.waitForTimeout(500);
  s = await state();
  check('lost: blinking red / blue', /is-reconnecting/.test(s.className) && s.animation === 'connection-reconnecting', JSON.stringify(s));
  check('lost: icon can be clicked', !s.disabled, JSON.stringify(s));
  await page.screenshot({path: `${OUT}/52-reconnecting.png`});

  // backoff is at 2 s now - click tries at once
  await page.waitForTimeout(1200);
  const beforeClick = wsConnections;
  await icon.click();
  await page.waitForTimeout(300);
  check('click while unreachable tries again at once', wsConnections === beforeClick + 1 && /Reconnecting to server/.test(await toasts()), `${wsConnections - beforeClick} ${await toasts()}`);
  s = await state();
  check('still blinking while unreachable', /is-reconnecting/.test(s.className), JSON.stringify(s));

  // --- server reachable again: click reconnects without waiting for backoff (5 s now)
  blocked = false;
  await page.waitForTimeout(300);
  await icon.click();
  await page.waitForTimeout(700);
  s = await state();
  check('click reconnects at once', /is-connect/.test(s.className) && s.disabled && s.animation === 'none', JSON.stringify(s));
  check('reconnected toast', /Reconnected to server/.test(await toasts()), await toasts());

  // --- session gone on server (restart): reconnect is refused, icon is grey and opens login
  const token = Object.values(await page.evaluate(() => JSON.parse(localStorage.getItem('established_connections'))))[0].user.token;
  await fetch(`http://${SERVER}/api/disconnect`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token})});
  dropConnection();
  await page.waitForTimeout(2500);
  s = await state();
  check('session gone: disconnected, clickable', !/is-connect|is-reconnecting/.test(s.className) && !s.disabled, JSON.stringify(s));
  await icon.click();
  await page.waitForTimeout(500);
  check('click opens login form', await page.getByText('Connect to State test').count() > 0);

  check('no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
