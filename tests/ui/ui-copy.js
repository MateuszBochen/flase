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
  const fs = require('fs');
  await page.getByText('edit_test', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);

  // --- ctrl: separate cells
  await (await cell(0, 'id')).click();
  await (await cell(2, 'name')).click({modifiers: ['Control']});
  check('ctrl+click adds cell', await grid().locator('.cell-selected').count() === 2, String(await grid().locator('.cell-selected').count()));
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(300);
  check('copy of separate cells - their rows x columns', (await clipboard()) === '1\ta\n3\tc', JSON.stringify(await clipboard()));
  await (await cell(2, 'name')).click({modifiers: ['Control']});
  check('ctrl+click on selected cell unselects it', await grid().locator('.cell-selected').count() === 1);

  // --- ctrl+drag adds second range, shift extends the last one
  const from = await (await cell(1, 'status')).boundingBox();
  const to = await (await cell(2, 'status')).boundingBox();
  await page.keyboard.down('Control');
  await page.mouse.move(from.x + 5, from.y + 5);
  await page.mouse.down();
  await page.mouse.move(to.x + 5, to.y + 5, {steps: 5});
  await page.mouse.up();
  await page.keyboard.up('Control');
  check('ctrl+drag adds range', await grid().locator('.cell-selected').count() === 3, String(await grid().locator('.cell-selected').count()));
  await (await cell(2, 'note')).click({modifiers: ['Shift']});
  check('shift extends last range', await grid().locator('.cell-selected').count() === 5, String(await grid().locator('.cell-selected').count()));
  await page.screenshot({path: `${OUT}/91-ctrl-selection.png`});
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(300);
  check('copy union of ranges', (await clipboard()) === '1\tnew\tNULL\n2\tnew\tx\n3\tnew\ty', JSON.stringify(await clipboard()));

  // --- whole rows of the same selection (all columns)
  const allColumns = await grid().locator('.header-cell .column-name').allInnerTexts();
  const wholeRows = [];
  for (let row = 0; row < 3; row++) {
    wholeRows.push((await rows().nth(row).locator('.data-table-cell').allInnerTexts()).map((text) => text.trim()).join('\t'));
  }
  const copyRowsAs = async (format) => {
    await (await cell(1, 'status')).click({button: 'right'});
    await page.getByRole('menuitem', {name: 'Copy selected rows as'}).hover();
    await page.waitForTimeout(200);
    await page.getByRole('menuitem', {name: format, exact: true}).click();
    await page.waitForTimeout(300);
  };
  await copyRowsAs('TSV');
  check('copy selected rows - all columns of rows with selected cell', (await clipboard()) === wholeRows.join('\n'), JSON.stringify(await clipboard()));
  check('selection kept after copying rows', await grid().locator('.cell-selected').count() === 5, String(await grid().locator('.cell-selected').count()));
  await copyRowsAs('JSON');
  const copiedJson = JSON.parse(await clipboard());
  check('copy selected rows as JSON', copiedJson.length === 3 && Object.keys(copiedJson[0]).length === allColumns.length && copiedJson[1].id == 2,
    JSON.stringify(copiedJson).slice(0, 200));

  // --- export
  const exportAs = async (scope, format) => {
    await grid().getByRole('button', {name: 'Export'}).click();
    await page.getByRole('menuitem', {name: scope}).hover();
    await page.waitForTimeout(200);
    const [download] = await Promise.all([
      page.waitForEvent('download', {timeout: 15000}),
      page.getByRole('menuitem', {name: format, exact: true}).click(),
    ]);
    return {name: download.suggestedFilename(), text: fs.readFileSync(await download.path(), 'utf8')};
  };

  await page.getByText('orders', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  await grid().getByRole('button', {name: 'Export'}).click();
  await page.getByRole('menuitem', {name: 'All rows as'}).hover();
  await page.waitForTimeout(200);
  await page.screenshot({path: `${OUT}/92-export-menu.png`});
  await page.keyboard.press('Escape');

  let file = await exportAs('Current page as', 'CSV');
  check('current page CSV', file.name === 'orders.csv' && file.text.split('\n').length === 101 && file.text.startsWith('id,customer_id,status,created_at'), `${file.name} ${file.text.split('\n').length}`);
  file = await exportAs('All rows as', 'CSV');
  await page.waitForTimeout(300);
  check('all rows CSV', file.text.split('\n').length === 501, String(file.text.split('\n').length));
  file = await exportAs('All rows as', 'SQL INSERT');
  check('all rows INSERT', file.name === 'orders.sql' && file.text.startsWith('INSERT INTO `orders`') && file.text.trim().endsWith(';') && file.text.split('\n').length === 501, `${file.name} ${file.text.slice(0, 40)}`);
  file = await exportAs('All rows as', 'JSON');
  check('all rows JSON', JSON.parse(file.text).length === 500);
  check('grid untouched by export', (await grid().locator('.pager-info').innerText()).replace(/\s+/g, ' ').includes('0 - 100 / 500'));

  // all rows respect WHERE of current query
  await (await cell(0, 'status')).click({button: 'right'});
  await page.getByRole('menuitem', {name: /^Filter: status = /}).click();
  await page.waitForTimeout(1500);
  const filteredTotal = (await grid().locator('.pager-info').innerText()).match(/\/\s*(\d+)\s*$/)[1];
  file = await exportAs('All rows as', 'TSV');
  check('all rows with filter', file.text.split('\n').length === Number(filteredTotal) + 1, `${file.text.split('\n').length - 1} vs ${filteredTotal}`);

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
