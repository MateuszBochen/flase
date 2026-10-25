// Long texts (MEDIUMTEXT of 240 000 characters): grid shows preview, value editor, copy and export load whole value.
// node ui-long-text.js
const {chromium} = require('playwright');
const fs = require('fs');
const OUT = process.env.SHOTS || '/pw/shots';
const LONG = 'lorem ipsum '.repeat(20000);

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 300) : ''}`);
};

(async () => {
  const connection = {id: 'long-text', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Long text', changeConfirmationRequired: false};
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
  await page.getByText('Long text', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(1000);

  const visibleTab = () => page.locator('.table-records-root:visible');
  const grid = () => visibleTab().locator('.cmp-records-view');
  const cell = (row, column) => grid().locator('.data-table-row').nth(row).locator('.data-table-cell').nth(column);
  const editor = () => page.locator('.cmp-value-editor');
  const clipboard = () => page.evaluate(() => navigator.clipboard.readText());
  const openTable = async (name) => {
    await page.getByText(name, {exact: true}).first().dispatchEvent('mousedown');
    await page.waitForFunction(() => document.querySelectorAll('.table-records-root .data-table-row').length > 0, null, {timeout: 10000});
    await page.waitForTimeout(800);
  };

  // --- preview in grid
  await openTable('long_text_test');
  const shown = await cell(0, 2).locator('.dtc-content').textContent();
  check('cell shows only beginning of long text', shown.length <= 1000 && shown.startsWith('lorem ipsum'), `${shown.length} characters`);
  check('title says it is longer', /240,000 characters/.test(await cell(0, 2).locator('.dtc-content').getAttribute('title')));
  await page.screenshot({path: `${OUT}/long-text-01-grid.png`});

  // --- copy loads whole value
  await cell(0, 2).click();
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(1000);
  check('Ctrl+C copies whole text', (await clipboard()) === LONG.replace(/[\t\n\r]/g, ' '), `${(await clipboard()).length} characters`);

  // --- double click opens value editor with whole value
  await cell(0, 2).dblclick();
  await editor().waitFor({timeout: 5000});
  await page.waitForFunction(() => document.querySelector('.cmp-value-editor textarea')?.value.length === 240000, null, {timeout: 10000}).catch(() => {});
  check('value editor has whole text', (await editor().locator('textarea').inputValue()).length === 240000, (await editor().locator('.value-editor-info').textContent()));
  check('whole text is editable', !(await editor().locator('textarea').getAttribute('readonly')));
  await page.screenshot({path: `${OUT}/long-text-02-editor.png`});
  await editor().locator('textarea').fill(LONG + 'END');
  await page.getByRole('button', {name: 'Save', exact: true}).click();
  await page.waitForTimeout(300);
  await grid().getByRole('button', {name: 'Submit'}).click();
  await page.waitForTimeout(1500);
  check('changed long text saved', errors.length === 0 && !(await grid().getByRole('button', {name: 'Submit'}).count()), errors.join(' | '));

  // value of database is loaded again - whole value ends with the change
  await cell(0, 2).dblclick();
  await editor().waitFor({timeout: 5000});
  await page.waitForFunction(() => (document.querySelector('.cmp-value-editor textarea')?.value.length || 0) > 240000, null, {timeout: 10000}).catch(() => {});
  check('saved value loaded whole', (await editor().locator('textarea').inputValue()).endsWith('END'));
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.waitForTimeout(300);

  // --- export of page (rows of grid) and of all rows (query again) has whole values
  const exportAs = async (scope, format) => {
    await grid().getByRole('button', {name: 'Export'}).click();
    await page.getByRole('menuitem', {name: scope}).hover();
    await page.waitForTimeout(200);
    const [download] = await Promise.all([
      page.waitForEvent('download', {timeout: 15000}),
      page.getByRole('menuitem', {name: format, exact: true}).click(),
    ]);
    return fs.readFileSync(await download.path(), 'utf8');
  };
  let csv = await exportAs('Current page as', 'CSV');
  check('export of page has whole text', csv.includes(LONG.slice(0, 1000)) && csv.includes('END') && csv.length > 240000, `${csv.length} bytes`);
  csv = await exportAs('All rows as', 'CSV');
  check('export of all rows has whole text', csv.includes('END') && csv.length > 240000, `${csv.length} bytes`);

  // --- table without primary key: preview only, copy as label
  await openTable('long_text_nokey');
  await cell(0, 1).dblclick();
  await editor().waitFor({timeout: 5000});
  await page.waitForTimeout(500);
  check('without primary key - only beginning shown, read only', /cannot be identified/i.test(await editor().textContent()) && (await editor().locator('textarea').getAttribute('readonly')) !== null,
    await editor().locator('.value-editor-toolbar').textContent());
  await page.keyboard.press('Escape');
  await page.getByRole('button', {name: /^(Close|Cancel)$/}).first().click().catch(() => {});
  await page.waitForTimeout(300);
  await cell(0, 1).click();
  await page.keyboard.press('Control+c');
  await page.waitForTimeout(800);
  check('without primary key - copied as label', (await clipboard()) === '[TEXT 200,000 characters]', await clipboard());

  check('no page errors', errors.filter((e) => !/could not be loaded whole/.test(e)).length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})();
