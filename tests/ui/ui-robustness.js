// Application survives corrupted storage of browser, odd tabs, odd names of tables and fast closing of tabs.
// node ui-robustness.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const API = 'http://localhost:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** statements through websocket of server (table with backtick in name is created and dropped by test) */
const execute = async (token, username, connection, statements) => {
  const ws = new WebSocket(`${API.replace('http', 'ws')}/ws/${token}`);
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  const done = new Promise((resolve) => ws.addEventListener('message', (m) => JSON.parse(m.data).message === 'EXECUTION_FINISHED' && resolve()));
  ws.send(JSON.stringify({connectionData: {user: {token, username}, connection}, command: 'EXECUTE_STATEMENTS', payload: {tabId: 'robust', database: 'shop', statements}}));
  await done;
  ws.close();
};

(async () => {
  const connection = {id: 'ui-robust', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Robust test', changeConfirmationRequired: false};
  const user = await (await fetch(`${API}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();
  await execute(user.token, user.username, connection, ['DROP TABLE IF EXISTS `back``tick`', 'CREATE TABLE `back``tick` (id INT PRIMARY KEY, `x``y` INT)', 'INSERT INTO `back``tick` VALUES (1, 2)']);

  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1400, height: 900}})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const stored = {connections: JSON.stringify([connection]), established_connections: JSON.stringify({[connection.id]: {user, connection}})};
  const open = async (items) => {
    await page.goto('http://localhost:3000');
    await page.evaluate((items) => {
      localStorage.clear();
      Object.entries(items).forEach(([key, value]) => localStorage.setItem(key, value));
    }, items);
    await page.reload();
    await sleep(1500);
  };
  const rendered = () => page.evaluate(() => !!document.querySelector('.resizable-columns-root') && !!document.querySelector('.tab-label-list-root'));
  const tabError = () => page.locator('.tab-error-boundary').count();

  // --- corrupted storage: application starts, valid data are kept
  await open({...stored, connections: '{bad'});
  check('invalid JSON of connections: application starts', await rendered() && !errors.length, errors.join('; '));
  await open({...stored, connections: JSON.stringify([null, 5, connection]), established_connections: '[1]', 'open-tabs': '{"tabs": [null, 5, {}]}'});
  check('items of wrong shape left out, valid connection kept', await rendered() && !errors.length && await page.getByText('Robust test', {exact: true}).count() === 1, errors.join('; '));

  // --- stored tabs with props of other version / removed table
  const tabs = {tabs: [
    {id: 'a', type: 'table', tabName: 'no props', props: {}, connectionId: connection.id},
    {id: 'b', type: 'console', tabName: 'odd database', props: {database: 5}, connectionId: connection.id},
    {id: 'c', type: 'table', tabName: 'shop/removed_table', props: {database: {name: 'shop'}, table: {tableName: 'removed_table', dataBaseName: 'shop', columns: [], primaryColumns: [], uniqueColumns: []}}, connectionId: connection.id},
  ], currentTab: 2};
  await open({...stored, 'open-tabs': JSON.stringify(tabs)});
  await sleep(1000);
  const labels = (await page.locator('.tab-label-list-item').allInnerTexts()).map((text) => text.split('\n')[0].trim());
  check('tabs with invalid props are not restored', JSON.stringify(labels) === '["shop/removed_table"]', JSON.stringify(labels));
  check('tab of removed table works', await rendered() && !errors.length && await tabError() === 0, errors.join('; '));

  // --- table with backtick in name
  await open(stored);
  await page.getByText('Robust test', {exact: true}).first().click();
  await sleep(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await sleep(1000);
  await page.locator('.vertical-slider-label', {hasText: /^shop$/}).click();
  await sleep(1200);
  await page.getByText('back`tick', {exact: true}).first().dispatchEvent('mousedown');
  await sleep(1500);
  const grid = page.locator('.table-records-root:visible .cmp-records-view');
  check('table with backtick in name opens', await tabError() === 0 && await grid.locator('.data-table-row').count() === 1 && !errors.length, errors.join('; '));

  // --- many tabs closed fast: one tab stays and it is shown
  const filter = page.locator('input[placeholder="Filter tables…"]').first();
  for (const name of ['customers', 'orders', 'products', 'categories', 'digits', 'edit_test']) {
    await filter.fill(name);
    await page.keyboard.press('Control+Enter');
  }
  await sleep(1500);
  await filter.fill('');
  await page.locator('.tab-label-list-item').nth(3).click();
  await sleep(300);
  for (let i = 0; i < 12; i++) await page.keyboard.press('Alt+w');
  await sleep(800);
  const left = await page.locator('.tab-label-list-item').count();
  const active = await page.locator('.tab-label-list-item.active').count();
  const shown = await page.locator('.application-render-root .tab-wrapper.active').count();
  check('fast Alt+W: one tab stays, active and shown', left === 1 && active === 1 && shown === 1, JSON.stringify({left, active, shown}));
  await page.screenshot({path: `${OUT}/robustness-01.png`});

  check('no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  await execute(user.token, user.username, connection, ['DROP TABLE IF EXISTS `back``tick`']);
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
