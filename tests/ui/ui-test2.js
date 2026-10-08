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
  const rows = grid.locator('.data-table-row');

  // --- clone row 1 through form, change name
  await menu(rows.nth(0).locator('.data-table-cell').nth(0), 'Clone row…');
  await page.waitForTimeout(300);
  const form = page.locator('.cmp-row-form');
  const idField = form.locator('.row-form-field').filter({hasText: 'PK'});
  check('clone leaves auto increment to database', (await idField.innerText()).includes('auto increment'), await idField.innerText());
  const nameInput = form.locator('.row-form-field').filter({hasText: 'varchar(50)'}).locator('.cell-editor-input');
  check('clone copies values', (await nameInput.inputValue()) === 'a', await nameInput.inputValue());
  await nameInput.fill('cloned');
  await page.getByRole('button', {name: 'Save'}).click();
  await page.waitForTimeout(200);

  // --- edit row 2 through form: long text in textarea
  await menu(rows.nth(1).locator('.data-table-cell').nth(0), 'Edit row…');
  await page.waitForTimeout(300);
  const note = page.locator('.cmp-row-form .row-form-field').filter({hasText: 'text'}).locator('textarea');
  check('text column edited in textarea', await note.count() === 1);
  await note.fill('line 1\nline 2');
  await page.getByRole('button', {name: 'Save'}).click();
  await page.waitForTimeout(200);
  check('2 pending', (await grid.locator('.pending-count').innerText()).startsWith('2'), await grid.locator('.pending-count').innerText());

  // --- invalid value -> submit fails, changes stay, nothing saved
  const priceCell = rows.nth(2).locator('.data-table-cell').nth(6);
  await priceCell.dblclick();
  await grid.locator('.cell-editor-input').fill('not a number');
  await grid.locator('.cell-editor-input').press('Enter');
  // submit from context menu this time
  await menu(rows.nth(0).locator('.data-table-cell').nth(0), 'Submit changes');
  await page.waitForTimeout(1500);
  await page.screenshot({path: `${OUT}/11-error.png`});
  const toastText = await page.locator('[role="status"]').allInnerTexts();
  check('error toast shown', toastText.some((t) => /Nothing was saved/.test(t)), toastText.join(' | '));
  check('changes kept after error', (await grid.locator('.pending-count').innerText()).startsWith('3'), await grid.locator('.pending-count').innerText());
  check('grid still shows data', await rows.count() === 4, String(await rows.count()));

  // --- fix value and submit
  await priceCell.dblclick();
  await grid.locator('.cell-editor-input').fill('12.50');
  await grid.locator('.cell-editor-input').press('Enter');
  await grid.getByRole('button', {name: 'Submit'}).click();
  await page.waitForTimeout(2000);
  const texts = await rows.allInnerTexts();
  check('saved after fix', texts.length === 4 && texts[1].includes('line 1') && texts[2].includes('12.50') && texts[3].includes('cloned'), JSON.stringify(texts));

  // --- join result is read only
  const editor = page.locator('.monaco-editor').last();
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('SELECT * FROM orders o JOIN customers c ON c.id = o.customer_id LIMIT 5');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  const readOnly = grid.locator('.pending-bar.read-only');
  check('JOIN read only', (await readOnly.count()) === 1 && (await readOnly.getAttribute('title')).includes('JOIN'), await readOnly.getAttribute('title').catch(() => ''));
  await rows.nth(0).locator('.data-table-cell').nth(1).dblclick();
  check('no editor on read only', await grid.locator('.cell-editor-input').count() === 0);
  await page.screenshot({path: `${OUT}/12-join.png`});

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
