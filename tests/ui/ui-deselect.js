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
  const context = await browser.newContext({viewport: {width: 1500, height: 900}, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true});
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

  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
  await page.getByText('edit_test', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  const selectedCells = () => grid().locator('.cell-selected').count();
  const selectedRows = () => grid().locator('.data-table-row.selected').count();
  const selectSomething = async () => {
    await (await cell(0, 'id')).click();
    await (await cell(1, 'name')).click({modifiers: ['Shift']});
  };

  await selectSomething();
  check('selected', await selectedCells() === 4 && await selectedRows() === 1);
  const content = await grid().locator('.data-table-content').boundingBox();
  await page.mouse.click(content.x + 300, content.y + content.height - 50);
  check('click on empty grid area clears selection', await selectedCells() === 0 && await selectedRows() === 0, `${await selectedCells()} cells ${await selectedRows()} rows`);

  await selectSomething();
  await visibleTab().locator('.speed-dial-buttons').click({position: {x: 400, y: 5}});
  check('click on tab header clears selection', await selectedCells() === 0 && await selectedRows() === 0);

  await selectSomething();
  // empty part of left menu, below the table list
  await page.mouse.click(100, 700);
  check('click in sidebar clears selection', await selectedCells() === 0 && await selectedRows() === 0);

  await selectSomething();
  await (await cell(1, 'id')).click();
  await page.keyboard.press('Escape');
  check('Escape clears cells and row', await selectedCells() === 0 && await selectedRows() === 0);

  // menu and dialog keep selection
  await selectSomething();
  await (await cell(1, 'name')).click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Copy selection as'}).click();
  await page.getByRole('menuitem', {name: 'CSV', exact: true}).click();
  await page.waitForTimeout(300);
  check('context menu works with selection', (await clipboard()) === 'id,name\n1,a\n2,b' && await selectedCells() === 4, JSON.stringify(await clipboard()));
  await (await cell(0, 'name')).click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Open value editor…'}).click();
  await page.locator('.cmp-value-editor textarea').click();
  check('dialog keeps selection', await selectedCells() === 4);
  await page.getByRole('button', {name: 'Cancel'}).click();

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
