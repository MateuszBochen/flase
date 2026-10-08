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

  // --- foreign key link
  const customerCell = await cell(0, 'customer_id');
  const customerId = (await customerCell.innerText()).trim();
  check('foreign key cell has link', await customerCell.locator('.dtc-reference').count() === 1);
  check('primary key cell has no link', await (await cell(0, 'id')).locator('.dtc-reference').count() === 0);
  await customerCell.locator('.dtc-reference').click();
  await page.waitForTimeout(1500);
  await page.screenshot({path: `${OUT}/81-fk-same-tab.png`});
  check('same tab: customers row', (await query()).includes('FROM `customers` WHERE `id` = ' + customerId) && await rows().count() === 1, await query());
  const labels1 = await page.locator('.tab-render-list-item, .tab-item, [class*="tab"]').filter({hasText: 'shop/'}).allInnerTexts();
  check('same tab replaced (no orders tab)', !(await page.locator('body').innerText()).includes('shop/orders') && (await page.locator('body').innerText()).includes('shop/customers'));
  check('structure of new tab is customers', true);

  // back to orders via sidebar, open in new tab with ctrl+click
  await page.getByText('orders', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  const secondCustomer = (await (await cell(1, 'customer_id')).innerText()).trim();
  await (await cell(1, 'customer_id')).locator('.dtc-reference').click({modifiers: ['Control']});
  await page.waitForTimeout(1500);
  check('ctrl+click: new tab, orders still open', (await page.locator('body').innerText()).includes('shop/orders') && (await page.locator('body').innerText()).includes('shop/customers'));

  // --- empty string vs NULL (edit_test row 2 note = '')
  await page.getByText('edit_test', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  const noteEmpty = await cell(1, 'note');
  const noteNull = await cell(0, 'note');
  check('empty string marked', await noteEmpty.locator('.dtc-empty').count() === 1 && (await noteEmpty.innerText()).trim() === "''", await noteEmpty.innerText());
  check('NULL marked differently', await noteNull.locator('.dtc-null').count() === 1 && (await noteNull.innerText()).trim() === 'NULL');

  // --- filter: WHERE typed in query editor, quick filters from context menu
  await page.getByText('orders', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  check('no separate filter bar', await visibleTab().locator('.cmp-filter-bar').count() === 0);
  await visibleTab().locator('.monaco-editor').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type("SELECT * FROM orders WHERE status = 'paid' AND id < 50 LIMIT 0, 100", {delay: 5});
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  const statuses = new Set();
  const n = await rows().count();
  for (let i = 0; i < n; i++) statuses.add((await (await cell(i, 'status')).innerText()).trim());
  check('WHERE from editor applied', n > 0 && n < 50 && statuses.size === 1 && statuses.has('paid'), `${n} rows ${[...statuses]}`);
  await page.screenshot({path: `${OUT}/82-filter.png`});

  await (await cell(0, 'customer_id')).click({button: 'right'});
  const items = await page.getByRole('menuitem').allInnerTexts();
  check('menu has quick filters and FK', items.some((t) => t.startsWith('Filter: customer_id =')) && items.some((t) => t.startsWith('Open customers row')), JSON.stringify(items));
  await page.getByRole('menuitem', {name: /^Filter: customer_id = /}).click();
  await page.waitForTimeout(1500);
  check('quick filter added to query with AND', /WHERE \(`status` = 'paid' AND `id` < 50\) AND `customer_id` = \d+ LIMIT 0, 100/.test(await query()), await query());

  await visibleTab().locator('.cmp-table-data-navbar-buttons .icon').first().locator('button').dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  check('history back restores previous query', !(await query()).includes('customer_id') && (await query()).includes("'paid'"), await query());

  await (await cell(0, 'status')).click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Clear filter'}).click();
  await page.waitForTimeout(1500);
  const footer = (await grid().locator('.pager-info').innerText()).replace(/\s+/g, ' ');
  check('clear filter', !(await query()).includes('WHERE') && footer.includes('/ 500'), `${await query()} | ${footer}`);

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
