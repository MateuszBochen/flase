// UI test of row editing. node ui-test.js <confirmRequired 0|1>
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const confirmRequired = process.argv[2] === '1';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};

(async () => {
  const connection = {id: 'ui-test', dsn: 'mysql://mariadb', username: 'flase', displayName: 'UI test', changeConfirmationRequired: confirmRequired};
  const res = await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})});
  const user = await res.json();

  const browser = await chromium.launch();
  const context = await browser.newContext({viewport: {width: 1500, height: 900}, permissions: ['clipboard-read', 'clipboard-write']});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
  }, [connection, user]);
  await page.reload();
  await page.waitForTimeout(1500);

  await page.getByText('UI test', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({path: `${OUT}/01-menu.png`});
  await page.getByText('orders', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  await page.screenshot({path: `${OUT}/02-table.png`});

  const menu = async (target, label) => {
    await target.click({button: 'right'});
    await page.getByRole('menuitem', {name: label, exact: true}).click();
    await page.waitForTimeout(200);
  };
  const blankArea = () => page.locator('.cmp-records-view').last().locator('.data-table-content');
  const rightClickBlank = async (label) => {
    const box = await blankArea().boundingBox();
    await page.mouse.click(box.x + 200, box.y + box.height - 40, {button: 'right'});
    await page.getByRole('menuitem', {name: label, exact: true}).click();
    await page.waitForTimeout(200);
  };
  const visibleTab = () => page.locator('.table-records-root:visible');
  const grid = () => visibleTab().locator('.cmp-records-view');
  const rows = () => grid().locator('.data-table-row');
  const query = async () => (await visibleTab().locator('.monaco-editor').innerText()).replace(/\s+/g, ' ').trim();
  const tabLabels = async () => (await page.locator('[class*="tab-label-list-item"], [class*="tab-label"] li, [class*="tab-label"] > *').allInnerTexts());
  const columnIndex = async (name) => (await grid().locator('.header-cell .column-name').allInnerTexts()).indexOf(name);
  const cell = async (row, name) => rows().nth(row).locator('.data-table-cell').nth(await columnIndex(name));

  // second tab, so suggestions of tabs could mix
  await page.getByText('customers', {exact: true}).first().dispatchEvent('mousedown', {button: 1});
  await page.waitForTimeout(1200);
  await page.getByText('orders', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);

  const suggestions = async () => {
    await page.waitForTimeout(700);
    const items = await page.locator('.monaco-editor .suggest-widget .monaco-list-row').allInnerTexts();
    return items.map((text) => text.split('\n')[0].trim());
  };
  const typeQuery = async (text) => {
    await visibleTab().locator('.monaco-editor').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Delete');
    await page.keyboard.type(text, {delay: 15});
  };

  await typeQuery('SELECT * FROM orders o WHERE o.');
  let items = await suggestions();
  await page.screenshot({path: `${OUT}/87-completion-alias.png`});
  check('alias. suggests columns of that table only', ['id', 'customer_id', 'status', 'created_at'].every((c) => items.includes(c)) && !items.includes('email') && !items.includes('SELECT'), JSON.stringify(items));
  await page.keyboard.press('Escape');

  await typeQuery('SELECT * FROM cust');
  await page.keyboard.press('Control+Space');
  items = await suggestions();
  check('table name suggested', items.includes('customers'), JSON.stringify(items));
  check('no dummy Label suggestion', !items.includes('Label'), JSON.stringify(items));
  await page.keyboard.press('Escape');

  await typeQuery('SELECT * FROM customers c JOIN orders o ON o.customer_id = c.id WHERE ');
  await page.keyboard.press('Control+Space');
  items = await suggestions();
  check('columns of used tables first', items.slice(0, 5).some((c) => ['email', 'first_name', 'city', 'status', 'customer_id', 'id'].includes(c)), JSON.stringify(items.slice(0, 8)));
  await page.keyboard.press('Escape');

  // duplicates would appear if every tab registered own provider
  await typeQuery('SELECT * FROM orders WHERE stat');
  await page.keyboard.press('Control+Space');
  items = await suggestions();
  check('no duplicated suggestions', items.filter((c) => c === 'status').length === 1, JSON.stringify(items));
  await page.keyboard.press('Escape');

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
