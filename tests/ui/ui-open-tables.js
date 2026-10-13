// Sidebar marks tables open in tabs, table of the current tab differently.
// node ui-open-tables.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};

(async () => {
  const connection = {id: 'ui-open-tables', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Open tables test', changeConfirmationRequired: false};
  const user = await (await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();

  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1500, height: 900}})).newPage();
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
  await page.getByText('Open tables test', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(1500);

  const root = page.locator('.table-list-menu-root').first();
  const input = root.locator('input[placeholder="Filter tables…"]');
  const marked = async (className) => (await root.locator(`li.${className}`).allInnerTexts()).map((text) => text.trim()).sort().join(',');
  const tabs = page.locator('.tab-label-list-item');

  check('nothing marked without table tabs', await marked('open-in-tab') === '' && await marked('active-in-tab') === '');

  // categories in current tab, customers and orders in background tabs (Ctrl+Enter)
  await input.click();
  await page.keyboard.type('categories');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  for (const name of ['customers', 'orders']) {
    await input.fill(name);
    await page.waitForTimeout(100);
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(500);
  }
  await input.fill('');
  await page.waitForTimeout(300);
  check('tables of tabs marked', await marked('open-in-tab') === 'categories,customers,orders', await marked('open-in-tab'));
  check('table of current tab marked as active', await marked('active-in-tab') === 'categories', await marked('active-in-tab'));

  const styleOf = (name) => root.locator('li', {hasText: new RegExp(`^${name}$`)}).locator('button').evaluate((button) => {
    const style = getComputedStyle(button);
    return {shadow: style.boxShadow, weight: style.fontWeight, background: style.backgroundColor};
  });
  const active = await styleOf('categories');
  const open = await styleOf('customers');
  const closed = await styleOf('digits');
  check('open table has bar', open.shadow !== 'none' && closed.shadow === 'none', JSON.stringify({open, closed}));
  check('active table looks different from open one', active.shadow !== open.shadow && active.weight !== open.weight, JSON.stringify({active, open}));
  await page.screenshot({path: `${OUT}/open-tables-01.png`});

  // switching tab moves active mark
  await tabs.filter({hasText: 'shop/customers'}).first().click();
  await page.waitForTimeout(300);
  check('switched tab: active mark follows', await marked('active-in-tab') === 'customers', await marked('active-in-tab'));

  // closing tab removes mark
  await tabs.filter({hasText: 'shop/orders'}).first().locator('.tab-close, button, span').last().click().catch(() => undefined);
  await page.waitForTimeout(300);
  const openAfterClose = await marked('open-in-tab');
  check('closed tab: table not marked', !openAfterClose.includes('orders') && openAfterClose.includes('categories'), openAfterClose);

  // arrow choice is still visible on marked table
  await input.click();
  await page.keyboard.type('cust');
  await page.waitForTimeout(200);
  const chosen = await styleOf('customers');
  check('chosen by arrows has background also on open table', chosen.background !== open.background, JSON.stringify({chosen, open}));

  check('no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
