// UI test of connections defined by administrator (server /api/config is mocked in browser)
// node ui-predefined.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};

const predefined = {id: 'env:shop-prod', displayName: 'Shop prod', dsn: 'mysql://mariadb:3306', username: 'flase', readOnly: true,
  color: '#d9534f', changeConfirmationRequired: false, predefined: true};
const own = {id: 'own-1', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Own connection', changeConfirmationRequired: false};

const start = async (browser, allowCustom) => {
  const page = await (await browser.newContext({viewport: {width: 1400, height: 900}})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/api/config', (route) => route.fulfill({json: {allowCustomConnections: allowCustom, connections: [predefined]}}));
  await page.goto('http://localhost:3000');
  await page.evaluate((own) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([own]));
  }, own);
  await page.reload();
  await page.waitForTimeout(1500);
  return {page, errors};
};

(async () => {
  const browser = await chromium.launch();

  // --- only connections of administrator
  let {page, errors} = await start(browser, false);
  const labels = () => page.locator('li.vertical-slider-item > .vertical-slider-label').allInnerTexts();
  check('predefined connection in sidebar, own hidden', JSON.stringify(await labels()) === '["Shop prod"]', JSON.stringify(await labels()));
  check('marked as defined by administrator', await page.locator('.connection-predefined').count() === 1 && await page.locator('.connection-read-only').count() === 1);
  check('no new connection button', await page.locator('[title="Creating new connection"]').count() === 0);
  check('welcome page without new connection', await page.locator('.welcome-action.managed').count() === 1
    && await page.getByRole('button', {name: /New connection/}).count() === 0);
  await page.screenshot({path: `${OUT}/predefined-01-sidebar.png`});

  // connect through predefined connection (user is prefilled)
  await page.getByText('Shop prod', {exact: true}).click();
  await page.waitForTimeout(300);
  await page.locator('[title="Click to connect to database"]').first().click();
  await page.waitForTimeout(300);
  check('connect form has default user', await page.locator('input[name="username"]').inputValue() === 'flase');
  await page.locator('input[name="password"]').fill('flase');
  await page.getByRole('button', {name: 'Connect', exact: true}).click();
  await page.waitForTimeout(1500);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(1000);
  check('connected - databases listed', await page.getByText('shop', {exact: true}).count() > 0);

  // settings: only information, no editing, no delete
  await page.locator('[title^="Connection settings"]').first().click();
  await page.waitForTimeout(300);
  const popup = page.locator('.cmp-connection-settings.managed');
  check('settings show configuration of server', await popup.count() === 1 && (await popup.innerText()).includes('mysql://mariadb:3306')
    && /enforced by server/.test(await popup.innerText()));
  check('settings cannot change or delete', await page.getByRole('button', {name: /delete/i}).count() === 0 && await popup.locator('input').count() === 0);
  await page.screenshot({path: `${OUT}/predefined-02-settings.png`});
  await page.getByRole('button', {name: 'Close', exact: true}).click();
  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300));
  await page.context().close();

  // --- own connections allowed too
  ({page, errors} = await start(browser, true));
  check('allowed: predefined first, then own', JSON.stringify(await labels()) === '["Shop prod","Own connection"]', JSON.stringify(await labels()));
  check('allowed: new connection button', await page.locator('[title="Creating new connection"]').count() === 1);
  check('no page errors (allowed)', errors.length === 0, errors.join(' | ').slice(0, 300));

  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
