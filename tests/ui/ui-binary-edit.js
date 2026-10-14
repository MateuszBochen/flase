// Editing of binary values (BLOB, bytea) in value editor: hex, text, file, NULL, row form, new row.
// node ui-binary-edit.js <mariadb|postgres>
const fs = require('fs');
const crypto = require('crypto');
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const API = 'http://localhost:3001';
const engine = process.argv[2] || 'mariadb';
const DSN = {mariadb: 'mysql://mariadb', postgres: 'postgresql://postgres:5432/shop'}[engine];
const DATABASE = engine === 'postgres' ? 'public' : 'shop';
/** more than preview of grid (4 KiB) - only beginning is in grid */
const BIG_BYTES = 60000;

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${engine}] ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const execute = async (token, username, connection, statements) => {
  const ws = new WebSocket(`${API.replace('http', 'ws')}/ws/${token}`);
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  const done = new Promise((resolve) => ws.addEventListener('message', (m) => JSON.parse(m.data).message === 'EXECUTION_FINISHED' && resolve()));
  ws.send(JSON.stringify({connectionData: {user: {token, username}, connection}, command: 'EXECUTE_STATEMENTS', payload: {tabId: 'binary', database: DATABASE, statements}}));
  await done;
  ws.close();
};

(async () => {
  const connection = {id: `ui-binary-${engine}`, dsn: DSN, username: 'flase', displayName: 'Binary edit', changeConfirmationRequired: false};
  const user = await (await fetch(`${API}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();
  await execute(user.token, user.username, connection, [engine === 'postgres'
    ? `INSERT INTO value_test (id, data) VALUES (100, decode(repeat('00ff7f80', ${BIG_BYTES / 4}), 'hex'))`
    : `INSERT INTO value_test (id, data) VALUES (100, REPEAT(UNHEX('00FF7F80'), ${BIG_BYTES / 4}))`]);

  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1500, height: 900}, acceptDownloads: true})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
  }, [connection, user]);
  await page.reload();
  await sleep(1500);
  await page.getByText('Binary edit', {exact: true}).first().click();
  await sleep(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await sleep(1000);
  await page.locator('.vertical-slider-label', {hasText: new RegExp(`^${DATABASE}$`)}).click();
  await sleep(1200);
  await page.getByText('value_test', {exact: true}).first().dispatchEvent('mousedown');
  await sleep(1800);

  const grid = page.locator('.table-records-root:visible .cmp-records-view');
  const rows = grid.locator('.data-table-row');
  const editor = page.locator('.cmp-value-editor');
  const textarea = editor.locator('textarea');
  /** value editor over row form is rendered inside the form - its Save is the first one */
  const editorSave = () => page.getByRole('button', {name: 'Save'}).first();
  const columnIndex = async (name) => (await grid.locator('.header-cell .column-name').allInnerTexts()).indexOf(name);
  const cell = async (row, name) => rows.nth(row).locator('.data-table-cell').nth(await columnIndex(name));
  const rowOfId = async (id) => {
    const index = await columnIndex('id');
    for (let row = 0; row < await rows.count(); row++) {
      if ((await rows.nth(row).locator('.data-table-cell').nth(index).innerText()).trim() === String(id)) return row;
    }
    return -1;
  };
  const cellText = async (id) => (await (await cell(await rowOfId(id), 'data')).innerText()).trim();
  const openEditor = async (id) => {
    await (await cell(await rowOfId(id), 'data')).click({button: 'right'});
    await page.getByRole('menuitem', {name: 'Open value editor…'}).click();
    await sleep(300);
  };
  const submit = async () => {
    await grid.getByRole('button', {name: 'Submit'}).click();
    await sleep(1800);
  };
  /** whole value from server (download loads it, grid has only preview) */
  const downloaded = async (id) => {
    const waiting = page.waitForEvent('download', {timeout: 10000});
    await (await cell(await rowOfId(id), 'data')).click({button: 'right'});
    await page.getByRole('menuitem', {name: 'Download value', exact: true}).click();
    const file = await waiting;
    const path = `${OUT}/binary-edit-${engine}-${id}.bin`;
    await file.saveAs(path);
    return fs.readFileSync(path);
  };

  // --- double click on binary cell opens value editor (bytes are not typed in narrow cell)
  await (await cell(await rowOfId(1), 'data')).dblclick();
  await sleep(400);
  check('double click opens value editor', await editor.count() === 1 && await grid.locator('.data-table-cell input, .data-table-cell textarea').count() === 0);

  // --- hex: invalid input is refused, valid one is saved as bytes
  await editor.getByRole('button', {name: 'Hex', exact: true}).click();
  check('text value shown as hex', (await textarea.inputValue()).startsWith('70 6C 61 69 6E'), await textarea.inputValue());
  await textarea.fill('CA FE 0');
  check('invalid hex refused', await page.getByRole('button', {name: 'Save'}).isDisabled() && (await editor.locator('.value-editor-error').innerText()).includes('hex'));
  await textarea.fill('0xCA FE\n00 01');
  check('hex accepted', await page.getByRole('button', {name: 'Save'}).isEnabled() && (await editor.locator('.value-editor-info').innerText()).startsWith('4 B'));
  await page.screenshot({path: `${OUT}/binary-edit-${engine}-hex.png`});
  await page.getByRole('button', {name: 'Save'}).click();
  await sleep(300);
  check('hex is pending change', await cellText(1) === '0xCAFE0001' && await rows.nth(await rowOfId(1)).locator('.data-table-cell.changed').count() === 1, await cellText(1));
  await submit();
  check('hex saved', await cellText(1) === '0xCAFE0001' && await grid.locator('.pending-count').count() === 0, await cellText(1));
  check('hex saved as bytes', (await downloaded(1)).toString('hex') === 'cafe0001');

  // --- text: written as UTF-8
  await openEditor(1);
  await editor.getByRole('button', {name: 'Hex', exact: true}).click();
  await textarea.fill('');
  await editor.getByRole('button', {name: 'Text', exact: true}).click();
  await textarea.fill('zażółć gęślą');
  await page.getByRole('button', {name: 'Save'}).click();
  await page.screenshot({path: `${OUT}/binary-edit-${engine}-text.png`});
  await submit();
  const text = (await downloaded(1)).toString('utf8');
  check('text saved as UTF-8', text === 'zażółć gęślą', `${JSON.stringify(text)} cell ${await cellText(1)}`);

  // --- file replaces long value, which grid has only partly
  const bigRow = await rowOfId(100);
  check('big value in grid', bigRow >= 0);
  await openEditor(100);
  check('long value is not typed', await textarea.count() === 0 && (await editor.locator('.value-editor-hint').innerText()).includes('replaced by file')
    && await page.getByRole('button', {name: 'Save'}).isDisabled());
  const bytes = crypto.randomBytes(20000);
  fs.writeFileSync(`${OUT}/binary-edit-upload.bin`, bytes);
  await editor.locator('input[type="file"]').setInputFiles(`${OUT}/binary-edit-upload.bin`);
  await sleep(500);
  check('file loaded', (await editor.locator('.value-editor-info').innerText()).includes('binary-edit-upload.bin')
    && (await textarea.inputValue()).startsWith(bytes.subarray(0, 4).toString('hex').toUpperCase().match(/../g).join(' ')));
  await page.getByRole('button', {name: 'Save'}).click();
  await submit();
  check('file saved', (await downloaded(100)).equals(bytes));

  // --- NULL
  await openEditor(100);
  await editor.getByRole('checkbox', {name: 'NULL'}).check();
  await page.getByRole('button', {name: 'Save'}).click();
  await submit();
  check('NULL saved', await cellText(100) === 'NULL', await cellText(100));

  // --- row form: binary field opens value editor
  await (await cell(await rowOfId(2), 'body')).click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Edit row…'}).click();
  await sleep(400);
  const field = page.locator('.cmp-row-form .row-form-binary').first();
  check('row form shows binary field', (await field.innerText()).includes('BLOB'), await field.innerText());
  await field.click();
  await sleep(300);
  await editor.getByRole('button', {name: 'Hex', exact: true}).click();
  await textarea.fill('01 02 03');
  await editorSave().click();
  await sleep(300);
  check('row form has new value', (await field.innerText()).includes('0x010203'), await field.innerText());
  await page.getByRole('button', {name: 'Save'}).click();
  await submit();
  check('row form value saved', (await downloaded(2)).toString('hex') === '010203');

  // --- new row with binary value
  await (await cell(0, 'id')).click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Add row…'}).click();
  await sleep(400);
  const dataField = page.locator('.cmp-row-form .row-form-field', {has: page.locator('.row-form-name', {hasText: /^data$/})});
  await dataField.locator('.row-form-default').click();
  await sleep(300);
  await editor.getByRole('button', {name: 'Hex', exact: true}).click();
  await textarea.fill('FF EE');
  await editorSave().click();
  await sleep(300);
  await page.getByRole('button', {name: 'Save'}).click();
  await submit();
  const values = [];
  for (let row = 0; row < await rows.count(); row++) {
    values.push((await rows.nth(row).locator('.data-table-cell').nth(await columnIndex('data')).innerText()).trim());
  }
  check('new row with binary value saved', values.includes('0xFFEE'), JSON.stringify(values));

  check('no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  await execute(user.token, user.username, connection, ['DELETE FROM value_test WHERE id = 100']);
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
