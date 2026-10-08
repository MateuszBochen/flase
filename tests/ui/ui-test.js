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
  const page = await browser.newPage({viewport: {width: 1500, height: 900}});
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
  await page.getByText('edit_test', {exact: true}).first().dispatchEvent('mousedown');
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
  const grid = page.locator('.cmp-records-view').last();
  check('no toolbar above grid', await grid.locator('.cmp-edit-toolbar').count() === 0);
  check('not read only', await grid.locator('.pending-bar.read-only').count() === 0);
  const rows = grid.locator('.data-table-row');
  check('3 rows shown', await rows.count() === 3, String(await rows.count()));
  check('NULL rendered', await grid.locator('.dtc-null').count() > 0);

  // --- inline edit: name of first row with apostrophe
  const nameCell = rows.nth(0).locator('.data-table-cell').nth(1);
  await nameCell.dblclick();
  const input = grid.locator('.cell-editor-input');
  check('inline editor opened', await input.count() === 1);
  await input.fill("O'Brien");
  await input.press('Enter');
  await page.waitForTimeout(200);
  check('cell marked changed', await rows.nth(0).locator('.data-table-cell.changed').count() === 1);
  check('value shown in grid', (await nameCell.innerText()).includes("O'Brien"), await nameCell.innerText());

  // --- inline edit: enum via select
  const statusCell = rows.nth(1).locator('.data-table-cell').nth(2);
  await statusCell.dblclick();
  await grid.locator('select.cell-editor-input').selectOption("it's done");
  await grid.locator('select.cell-editor-input').press('Enter');

  // --- inline edit: set NULL on note of row 2 (b, 'x')
  const noteCell = rows.nth(1).locator('.data-table-cell').nth(3);
  await noteCell.dblclick();
  await grid.locator('.cell-editor-null').click();
  await grid.locator('.cell-editor-input').press('Enter');
  check('NULL set from editor', (await noteCell.innerText()).includes('NULL'), await noteCell.innerText());

  // --- escape cancels
  const thirdName = rows.nth(2).locator('.data-table-cell').nth(1);
  await thirdName.dblclick();
  await grid.locator('.cell-editor-input').fill('should not stay');
  await grid.locator('.cell-editor-input').press('Escape');
  check('Escape cancels edit', (await thirdName.innerText()).trim() === 'c', await thirdName.innerText());

  // --- delete row 3
  // --- Set NULL from context menu (price of row 1)
  const priceCell = rows.nth(0).locator('.data-table-cell').nth(6);
  await priceCell.click({button: 'right'});
  await page.screenshot({path: `${OUT}/00-context-menu.png`});
  await page.getByRole('menuitem', {name: 'Set NULL', exact: true}).click();
  check('Set NULL from menu', (await priceCell.innerText()).includes('NULL'), await priceCell.innerText());

  await menu(rows.nth(2).locator('.data-table-cell').nth(0), 'Delete row');
  check('row marked deleted', await grid.locator('.data-table-row.row-deleted').count() === 1);

  // --- add row through form
  await rightClickBlank('Add row…');
  await page.waitForTimeout(300);
  await page.screenshot({path: `${OUT}/03-new-row-form.png`});
  const form = page.locator('.cmp-row-form');
  check('row form opened', await form.count() === 1);
  const nameField = form.locator('.row-form-field').filter({hasText: 'varchar(50)'});
  await nameField.locator('.row-form-default').click();
  await nameField.locator('.cell-editor-input').fill('from form');
  await page.getByRole('button', {name: 'Save'}).click();
  await page.waitForTimeout(300);
  check('inserted row shown', await grid.locator('.data-table-row.row-inserted').count() === 1);
  check('pending count', (await grid.locator('.pending-count').innerText()).startsWith('4'), await grid.locator('.pending-count').innerText());
  await page.screenshot({path: `${OUT}/04-pending.png`});

  // --- preview
  await grid.getByRole('button', {name: 'Preview SQL'}).click();
  await page.waitForTimeout(800);
  const preview = page.locator('.cmp-sql-preview');
  const sql = await preview.innerText();
  await page.screenshot({path: `${OUT}/05-preview.png`});
  check('preview has 4 statements', sql.split(';').filter((x) => x.trim()).length === 4, sql);
  check('preview escapes apostrophe', sql.includes("O\\'Brien"), sql);
  check('preview NULL', sql.includes('`note` = NULL') && sql.includes('`price` = NULL'), sql);
  await page.getByRole('button', {name: 'Close'}).click();

  // --- submit
  await grid.getByRole('button', {name: 'Submit'}).click();
  await page.waitForTimeout(800);
  if (confirmRequired) {
    check('confirmation dialog shown', await page.locator('.cmp-sql-preview').count() === 1);
    await page.screenshot({path: `${OUT}/06-confirm.png`});
    await page.getByRole('button', {name: 'Execute'}).click();
    await page.waitForTimeout(800);
  }
  await page.waitForTimeout(1000);
  await page.screenshot({path: `${OUT}/07-after-submit.png`});
  check('no pending after submit', await grid.locator('.pending-count').count() === 0);
  const texts = await rows.allInnerTexts();
  check('refreshed data', texts.length === 3 && texts[0].includes("O'Brien") && texts[1].includes("it's done") && texts[2].includes('from form'), JSON.stringify(texts));

  // --- read only query
  const editor = page.locator('.monaco-editor').last();
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('SELECT name, note FROM edit_test');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await page.screenshot({path: `${OUT}/08-read-only.png`});
  const readOnly = grid.locator('.pending-bar.read-only');
  check('read only shown in footer', (await readOnly.count()) === 1 && (await readOnly.getAttribute('title')).includes('primary key'), await readOnly.getAttribute('title').catch(() => ''));
  await rows.nth(0).locator('.data-table-cell').nth(0).click({button: 'right'});
  const items = await page.getByRole('menuitem').allInnerTexts();
  check('read only menu: no editing actions, reason shown', items.includes('Copy value') && items.some((t) => t.includes('Read only') && t.includes('primary key'))
    && !items.some((t) => /^(Edit cell|Set NULL|Edit row|Clone row|Delete row|Add row)/.test(t)), JSON.stringify(items));
  await page.keyboard.press('Escape');
  check('Escape closes menu', await page.locator('.ui-context-menu').count() === 0);

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
