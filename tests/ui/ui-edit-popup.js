// UI test of "Edit cell…" popup from context menu: text columns in big text area, other types in editor of type.
// node ui-edit-popup.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};

(async () => {
  const connection = {id: 'ui-popup', dsn: 'mysql://mariadb', username: 'flase', displayName: 'UI popup', changeConfirmationRequired: false};
  const res = await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})});
  const user = await res.json();

  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1500, height: 900}})).newPage();
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
  await page.getByText('UI popup', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(1000);

  const visibleTab = () => page.locator('.table-records-root:visible');
  const grid = () => visibleTab().locator('.cmp-records-view');
  const rows = () => grid().locator('.data-table-row');
  const columnIndex = async (name) => (await grid().locator('.header-cell .column-name').allInnerTexts()).indexOf(name);
  const cell = async (row, name) => rows().nth(row).locator('.data-table-cell').nth(await columnIndex(name));
  const cellText = async (row, name) => (await (await cell(row, name)).innerText()).trim();
  const editCell = async (row, name) => {
    await (await cell(row, name)).click({button: 'right'});
    await page.getByRole('menuitem', {name: 'Edit cell…', exact: true}).click();
    await page.waitForTimeout(300);
  };

  await page.getByText('edit_test', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);

  // --- text column: big text area
  await editCell(1, 'note');
  const area = page.locator('.cmp-value-editor textarea');
  const areaBox = await area.boundingBox();
  check('text column - big text area', areaBox && areaBox.width > 400 && areaBox.height > 150, JSON.stringify(areaBox));
  check('text area has current value and focus', await area.inputValue() === 'x' && await area.evaluate((el) => document.activeElement === el));
  await area.fill('first line\nsecond line of popup');
  await page.screenshot({path: `${OUT}/popup-01-text.png`});
  await page.getByRole('button', {name: 'Save', exact: true}).click();
  await page.waitForTimeout(300);
  check('text saved to cell as pending change', /first line/.test(await cellText(1, 'note'))
    && await (await cell(1, 'note')).evaluate((el) => el.classList.contains('changed')), await cellText(1, 'note'));

  // --- varchar too
  await editCell(0, 'name');
  check('varchar column - big text area', await page.locator('.cmp-value-editor textarea').count() === 1);
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.waitForTimeout(200);

  // --- number: editor of type in small popup, Enter saves
  await editCell(0, 'price');
  const input = page.locator('.cmp-cell-edit-popup input.cell-editor-input');
  check('number column - popup with input', await input.count() === 1 && await page.locator('.cmp-value-editor').count() === 0);
  check('input has current value and focus', await input.inputValue() === '1.10' && await input.evaluate((el) => document.activeElement === el), await input.inputValue());
  const inputBox = await input.boundingBox();
  check('input is wide (not as narrow as column)', inputBox && inputBox.width > 250, JSON.stringify(inputBox));
  await input.fill('7.25');
  await page.screenshot({path: `${OUT}/popup-02-number.png`});
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
  check('Enter saves number', await cellText(0, 'price') === '7.25' && await page.locator('.cmp-cell-edit-popup').count() === 0, await cellText(0, 'price'));

  // --- Escape does not change value
  await editCell(0, 'big');
  await page.locator('.cmp-cell-edit-popup input.cell-editor-input').fill('123');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Escape cancels', await cellText(0, 'big') === '9007199254740993' && await page.locator('.cmp-cell-edit-popup').count() === 0, await cellText(0, 'big'));

  // --- enum: list
  await editCell(2, 'status');
  const select = page.locator('.cmp-cell-edit-popup select');
  check('enum column - list of values', await select.count() === 1);
  await select.selectOption("it's done");
  await page.getByRole('button', {name: 'Save', exact: true}).click();
  await page.waitForTimeout(300);
  check('enum value saved', await cellText(2, 'status') === "it's done", await cellText(2, 'status'));

  // --- NULL from popup of nullable number
  await editCell(0, 'big');
  await page.locator('.cmp-cell-edit-popup .cell-editor-null').click();
  await page.getByRole('button', {name: 'Save', exact: true}).click();
  await page.waitForTimeout(300);
  check('NULL saved', await cellText(0, 'big') === 'NULL', await cellText(0, 'big'));

  // --- submit and check database
  await (await cell(0, 'id')).click({button: 'right'});
  await page.getByRole('menuitem', {name: /^Submit changes/}).click();
  await page.waitForTimeout(1500);
  // read again from database
  await visibleTab().locator('[title="Reload data"]').first().click();
  await page.waitForTimeout(1500);
  const saved = [await cellText(1, 'note'), await cellText(0, 'price'), await cellText(0, 'big'), await cellText(2, 'status')];
  check('changes written to database', /first line/.test(saved[0]) && /second line of popup/.test(saved[0]) && saved[1] === '7.25' && saved[2] === 'NULL' && saved[3] === "it's done"
    && await grid().locator('.data-table-cell.changed').count() === 0, JSON.stringify(saved));

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
