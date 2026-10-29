// Tabs restored after restart of server (session of token does not exist): table tab tells the connection is closed
// instead of loading forever, and it loads again after login. node ui-session-expired.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 500) : ''}`);
};

(async () => {
  const connection = {id: 'ui-expired', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Expired test', changeConfirmationRequired: false};
  const login = async () => (await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();
  const user = await login();
  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1400, height: 850}})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
    localStorage.setItem('open-connections', JSON.stringify([connection.id]));
  }, [connection, user]);
  await page.reload();
  await page.waitForTimeout(1500);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(1000);
  await page.locator('.vertical-slider-label', {hasText: /^shop$/}).first().click();
  await page.waitForTimeout(1000);
  // two tabs - the other one is mounted only when it is chosen
  await page.getByText('orders', {exact: true}).first().dispatchEvent('mousedown');
  await page.locator('.table-records-root:visible .data-table-row').first().waitFor();
  await page.getByText('customers', {exact: true}).first().dispatchEvent('mousedown', {button: 1});
  await page.waitForTimeout(1000);
  await page.locator('.tab-label-list-item').filter({hasText: 'shop/customers'}).first().click();
  await page.locator('.table-records-root:visible .data-table-row').first().waitFor();
  await page.waitForTimeout(800);

  // server restarted while browser was closed - storage still has the token, its session is gone
  const stored = await page.evaluate(() => ({tabs: localStorage.getItem('open-tabs'), established: localStorage.getItem('established_connections')}));
  check('tab stored', /customers/.test(stored.tabs || ''), stored.tabs);
  await page.goto('about:blank');
  await fetch('http://localhost:3001/api/disconnect', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: user.token})});
  // storage as it was when browser was closed - before scripts of application run
  await page.addInitScript((stored) => {
    if (sessionStorage.getItem('restored')) return;
    sessionStorage.setItem('restored', '1');
    localStorage.setItem('open-tabs', stored.tabs);
    localStorage.setItem('established_connections', stored.established);
  }, stored);
  await page.goto('http://localhost:3000');
  await page.waitForTimeout(3000);
  await page.screenshot({path: `${OUT}/expired-01.png`});
  const tab = page.locator('.table-records-root:visible');
  const text = (await tab.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('restored tab tells session expired', /Session of Expired test expired .*log in again/.test(text), text);
  check('no rows, no endless loading', await tab.locator('.data-table-row').count() === 0 && !/Loading/i.test(text), text);

  // tab chosen later sends its query when connection is already closed
  await page.locator('.tab-label-list-item').filter({hasText: 'shop/orders'}).first().click();
  await page.waitForTimeout(1500);
  const other = (await page.locator('.table-records-root:visible').innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('tab chosen later tells it is not connected', /(Not connected to|Session of) Expired test.*log in again/.test(other), other);
  await page.screenshot({path: `${OUT}/expired-01b.png`});

  // query sent while not logged in - error at once, not loading
  await page.locator('.table-records-root:visible [title="Reload data"]').first().click();
  await page.waitForTimeout(800);
  const reloaded = (await page.locator('.table-records-root:visible').innerText()).replace(/\s+/g, ' ');
  check('reload while not logged in tells it', /Not connected to Expired test - log in again/.test(reloaded), reloaded);
  check('no skeleton of columns with error', await page.locator('.table-records-root:visible .column-name-skeleton').count() === 0);

  // log in again - tab loads its rows
  const connectIcon = page.locator('[title="Click to connect to database"]').first();
  if (!await connectIcon.count()) await page.getByText('Expired test', {exact: true}).first().click();
  await connectIcon.click();
  await page.waitForTimeout(300);
  await page.locator('input[name="password"]').fill('flase');
  await page.getByRole('button', {name: 'Connect', exact: true}).click();
  await tab.locator('.data-table-row').first().waitFor({timeout: 10000}).catch(() => undefined);
  await page.screenshot({path: `${OUT}/expired-02.png`});
  check('after login the tab loads again', await tab.locator('.data-table-row').count() > 0, (await tab.innerText()).replace(/\s+/g, ' '));

  await page.locator('.tab-label-list-item').filter({hasText: 'shop/customers'}).first().click();
  await page.locator('.table-records-root:visible .data-table-row').first().waitFor({timeout: 5000}).catch(() => undefined);
  check('other tab loaded again too', await page.locator('.table-records-root:visible .data-table-row').count() > 0);

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})();
