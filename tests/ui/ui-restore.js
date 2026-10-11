// UI test of state restored after reload of page: tabs (order, active, query of table, text of console), open server and database
// node ui-restore.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};

(async () => {
  const connection = {id: 'ui-restore', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Restore test', changeConfirmationRequired: false};
  const res = await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})});
  const user = await res.json();

  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1400, height: 900}})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
  }, [connection, user]);
  await page.reload();
  await page.waitForTimeout(1500);

  const tabLabels = () => page.locator('.tab-label-list-item').allInnerTexts().then((texts) => texts.map((text) => text.split('\n')[0].trim()));
  const activeTab = () => page.locator('.tab-label-list-item.active').innerText().then((text) => text.split('\n')[0].trim());
  const visibleQuery = async () => (await page.locator('.table-records-root:visible .monaco-editor').first().innerText()).replace(/\s+/g, ' ').trim();
  const openTab = async (label) => {
    await page.locator('.tab-label-list-item').filter({hasText: label}).first().click();
    await page.waitForTimeout(800);
  };

  // --- build some state
  await page.getByText('Restore test', {exact: true}).click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(800);
  // customers replaces welcome tab, orders in new tab (middle click)
  await page.getByText('customers', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  await page.getByText('orders', {exact: true}).first().click({button: 'middle'});
  await page.waitForTimeout(1500);
  await openTab('shop/customers');
  // sort by city
  const cityHeader = page.locator('.table-records-root:visible .header-cell').filter({hasText: 'city'});
  await cityHeader.locator('.sort-box button').first().click();
  await page.waitForTimeout(1500);
  const sortedQuery = await visibleQuery();
  check('query sorted before reload', /ORDER BY `city` ASC/.test(sortedQuery), sortedQuery);

  // new tab (middle click), left click would replace the table tab
  await page.locator('.table-list-filter button[title="SQL console for shop"]').click({button: 'middle'});
  await page.waitForTimeout(1000);
  await openTab('Console: shop');
  await page.waitForTimeout(1000);
  await page.locator('.cmp-sql-console:visible .monaco-editor').first().click();
  await page.keyboard.type('SELECT 42 AS answer', {delay: 5});
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await openTab('shop/customers');

  const labelsBefore = await tabLabels();
  const activeBefore = await activeTab();

  // --- reload
  await page.reload();
  await page.waitForTimeout(3000);
  await page.screenshot({path: `${OUT}/restore-01-after-reload.png`});
  const labelsAfter = await tabLabels();
  check('tabs restored in the same order', JSON.stringify(labelsAfter) === JSON.stringify(labelsBefore), `${JSON.stringify(labelsBefore)} -> ${JSON.stringify(labelsAfter)}`);
  check('active tab restored', await activeTab() === activeBefore, `${activeBefore} -> ${await activeTab()}`);
  await page.waitForFunction(() => document.querySelectorAll('.table-records-root .data-table-row').length > 5, null, {timeout: 10000}).catch(() => {});
  check('query of table restored (sort)', /ORDER BY `city` ASC/.test(await visibleQuery()), await visibleQuery());
  check('rows of restored table loaded', await page.locator('.table-records-root:visible .data-table-row').count() > 5);
  check('server still open, databases listed, database open', await page.getByText('shop', {exact: true}).count() > 0
    && await page.locator('.table-list-menu-root').getByText('customers', {exact: true}).count() > 0);

  await openTab('Console: shop');
  const consoleText = (await page.locator('.cmp-sql-console:visible .monaco-editor .view-lines').first().innerText()).replace(/\s+/g, ' ').trim();
  check('text of console restored', consoleText === 'SELECT 42 AS answer', consoleText);

  // --- closed tab does not come back
  await page.locator('.tab-label-list-item').filter({hasText: 'shop/orders'}).locator('.close-tab').click();
  await page.waitForTimeout(500);
  await page.reload();
  await page.waitForTimeout(2500);
  check('closed tab is not restored', !(await tabLabels()).includes('shop/orders') && (await tabLabels()).includes('shop/customers'), JSON.stringify(await tabLabels()));

  // --- tabs of connection which is not logged in are not restored
  await page.evaluate(() => localStorage.setItem('established_connections', '{}'));
  await page.reload();
  await page.waitForTimeout(2000);
  check('tabs of not connected connection are not restored', !(await tabLabels()).some((label) => label.startsWith('shop/') || label.startsWith('Console')),
    JSON.stringify(await tabLabels()));

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
