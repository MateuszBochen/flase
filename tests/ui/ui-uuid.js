// UI test of tables with UUID primary key. node ui-uuid.js <mariadb|mysql|postgres>
// CHAR(36) / uuid key with foreign key, binary key (BINARY(16), bytea), native UUID type (MariaDB)
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const engine = process.argv[2] || 'mariadb';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${engine}] ${name}${info ? '  -- ' + info : ''}`);
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

(async () => {
  const dsn = {mariadb: 'mysql://mariadb', mysql: 'mysql://mysql', postgres: 'postgresql://postgres:5432/shop'}[engine];
  const connection = {id: `ui-uuid-${engine}`, dsn, username: 'flase', displayName: 'UUID test', changeConfirmationRequired: false};
  const res = await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})});
  const user = await res.json();

  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1500, height: 900}, permissions: ['clipboard-read', 'clipboard-write']})).newPage();
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
  await page.getByText('UUID test', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText(engine === 'postgres' ? 'public' : 'shop', {exact: true}).first().click();
  await page.waitForTimeout(1000);

  const visibleTab = () => page.locator('.table-records-root:visible');
  const grid = () => visibleTab().locator('.cmp-records-view');
  const rows = () => grid().locator('.data-table-row');
  const columnIndex = async (name) => (await grid().locator('.header-cell .column-name').allInnerTexts()).indexOf(name);
  const cell = async (row, name) => rows().nth(row).locator('.data-table-cell').nth(await columnIndex(name));
  const cellText = async (row, name) => (await (await cell(row, name)).innerText()).trim();
  const column = async (name) => {
    const values = [];
    for (let row = 0; row < await rows().count(); row++) values.push(await cellText(row, name));
    return values;
  };
  const openTable = async (name) => {
    await page.getByText(name, {exact: true}).first().dispatchEvent('mousedown');
    await page.waitForTimeout(1500);
  };
  const menu = async (target, label) => {
    await target.click({button: 'right'});
    await page.getByRole('menuitem', {name: label, exact: true}).click();
    await page.waitForTimeout(300);
  };
  const submit = async () => {
    await grid().getByRole('button', {name: 'Submit'}).click();
    await page.waitForTimeout(1500);
  };
  const reload = async () => {
    await visibleTab().locator('[title="Reload data"]').first().click();
    await page.waitForTimeout(1500);
  };
  const editText = async (row, name, value) => {
    await menu(await cell(row, name), 'Edit cell…');
    const area = page.locator('.cmp-value-editor textarea');
    if (await area.count()) {
      await area.fill(value);
      await page.getByRole('button', {name: 'Save', exact: true}).click();
    } else {
      await page.locator('.cmp-cell-edit-popup input.cell-editor-input').fill(value);
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(300);
  };
  const rowOf = async (name, value) => (await column(name)).indexOf(value);

  // --- browse: uuid as text
  await openTable('uuid_orders');
  await page.screenshot({path: `${OUT}/uuid-01-${engine}.png`});
  const ids = await column('id');
  check('uuid_orders rows', ids.length === 3 && ids.every((id) => UUID.test(id)), JSON.stringify(ids));

  // --- edit row identified by uuid
  const order = await rowOf('id', 'e5f6a7b8-c9d0-4e1f-9a2b-3c4d5e6f7a12');
  await editText(order, 'total', '42.42');
  await submit();
  await reload();
  check('edit by uuid key saved', await cellText(await rowOf('id', 'e5f6a7b8-c9d0-4e1f-9a2b-3c4d5e6f7a12'), 'total') === '42.42'
    && await grid().locator('.data-table-cell.changed').count() === 0);
  check('other rows unchanged', await cellText(await rowOf('id', 'd4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f11'), 'total') === '120.50');

  // --- foreign key of uuid
  const fkRow = await rowOf('id', 'f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b13');
  const fkCell = await cell(fkRow, 'customer_id');
  check('uuid foreign key has link', await fkCell.locator('.dtc-reference').count() === 1);
  await fkCell.locator('.dtc-reference').click();
  await page.waitForTimeout(1500);
  check('foreign key opens referenced customer', await rows().count() === 1 && await cellText(0, 'name') === 'Piotr'
    && await cellText(0, 'id') === '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c02', `${await rows().count()} row(s)`);

  // --- new row: uuid from DEFAULT of column
  await openTable('uuid_customers');
  const box = await grid().locator('.data-table-content').boundingBox();
  await page.mouse.click(box.x + 200, box.y + box.height - 40, {button: 'right'});
  await page.getByRole('menuitem', {name: 'Add row…', exact: true}).click();
  await page.waitForTimeout(300);
  const nameField = page.locator('.cmp-row-form .row-form-field').filter({hasText: 'varchar(100)'}).first();
  if (await nameField.locator('.row-form-default').count()) await nameField.locator('.row-form-default').click();
  await nameField.locator('.cell-editor-input').fill('Generated');
  await page.getByRole('button', {name: 'Save', exact: true}).click();
  await page.waitForTimeout(300);
  await submit();
  await reload();
  const generatedRow = await rowOf('name', 'Generated');
  const generatedId = generatedRow >= 0 ? await cellText(generatedRow, 'id') : '';
  check('new row gets uuid from column default', (await rows().count()) === 4 && UUID.test(generatedId), generatedId);

  // --- delete row by uuid
  await menu(await cell(generatedRow, 'name'), 'Delete row');
  await submit();
  await reload();
  check('delete by uuid key', await rows().count() === 3 && await rowOf('name', 'Generated') === -1, String(await rows().count()));

  {
    // --- binary key (BINARY(16), bytea): shown as hex, row is found by binary value
    await openTable('uuid_bin_test');
    await page.screenshot({path: `${OUT}/uuid-02-${engine}-binary.png`});
    const binIds = await column('id');
    check('binary(16) key with UUID default shown as UUID', binIds.includes('3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01'), JSON.stringify(binIds));
    const second = await rowOf('name', 'second');
    await editText(second, 'name', 'second edited');
    await submit();
    await reload();
    check('edit by binary(16) key saved', (await column('name')).includes('second edited') && (await column('name')).includes('first'), JSON.stringify(await column('name')));
  }

  {
    // --- foreign key to binary key: link opens referenced row (value was sent as "[object Object]"), name of row next to key
    await openTable('uuid_bin_notes');
    const noteRow = await rowOf('note', 'note of second');
    const keyCell = await cell(noteRow, 'item_id');
    check('binary foreign key shows name of referenced row', /second edited/.test(await keyCell.innerText()), await keyCell.innerText());
    await keyCell.locator('.dtc-reference').click();
    await page.waitForTimeout(1500);
    const query = (await visibleTab().locator('.monaco-editor').innerText()).replace(/\s+/g, ' ');
    check('binary foreign key opens referenced row', await rows().count() === 1 && await cellText(0, 'name') === 'second edited'
      && /7a8b9c0d1e2f4a3b8c4d5e6f7a8b9c02/i.test(query) && !/object Object/.test(query), `${await rows().count()} row(s) ${query}`);
    // quick filter by binary value
    await openTable('uuid_bin_notes');
    await (await cell(await rowOf('note', 'first note of first'), 'item_id')).click({button: 'right'});
    await page.getByRole('menuitem', {name: /^Filter: item_id = /}).click();
    await page.waitForTimeout(1500);
    check('quick filter by binary value', await rows().count() === 2 && (await column('note')).every((note) => /of first/.test(note)), JSON.stringify(await column('note')));
    // copy as INSERT writes bytes of binary key, not its text
    await (await cell(0, 'note')).click();
    await (await cell(0, 'note')).click({button: 'right'});
    await page.getByRole('menuitem', {name: 'Copy selected rows as'}).hover();
    await page.waitForTimeout(250);
    await page.getByRole('menuitem', {name: 'SQL INSERT', exact: true}).click();
    await page.waitForTimeout(300);
    const insert = await page.evaluate(() => navigator.clipboard.readText());
    check('copy as INSERT: binary key as bytes', engine === 'postgres'
      ? insert.includes("decode('3f2c1a9e6b7d4e8f9a0b1c2d3e4f5a01', 'hex')")
      : insert.includes("X'3f2c1a9e6b7d4e8f9a0b1c2d3e4f5a01'"), insert);
  }

  {
    // --- 16 bytes without UUID default: recognized by layout of values, MD5 hashes stay hex
    await openTable('bin16_test');
    const hashes = await column('hash');
    check('MD5 hashes stay hex', hashes.length === 4 && hashes.every((value) => /^0x[0-9A-F]{32}$/.test(value)), JSON.stringify(hashes));
    const refs = await column('ref');
    check('UUID v4 recognized', refs.join() === '3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01,7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c02,NULL,b1c2d3e4-f5a6-4b7c-9d8e-0f1a2b3c4d03', JSON.stringify(refs));
    check('swapped UUID v1 recognized', (await column('legacy'))[0] === '1026baba-6ccd-780c-9564-5b8c656024db', JSON.stringify(await column('legacy')));
    await page.screenshot({path: `${OUT}/uuid-04-${engine}-bin16.png`});

    const columnMenu = async (name, path) => {
      await (await cell(0, name)).click({button: 'right'});
      for (const label of path.slice(0, -1)) {
        await page.getByRole('menuitem', {name: label, exact: true}).hover();
        await page.waitForTimeout(250);
      }
      await page.getByRole('menuitem', {name: path[path.length - 1], exact: true}).click();
      await page.waitForTimeout(1200);
    };
    // automatic recognition is shown in menu, hex can be chosen instead, and UUID forced for other column
    await (await cell(0, 'ref')).click({button: 'right'});
    await page.getByRole('menuitem', {name: 'Display column as', exact: true}).hover();
    await page.waitForTimeout(250);
    check('menu tells column was recognized', await page.getByRole('menuitem', {name: 'Value (default) - recognized as UUID'}).count() === 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await columnMenu('ref', ['Display column as', 'Hexadecimal']);
    check('hex chosen instead of UUID', (await column('ref'))[0] === '0x3F2C1A9E6B7D4E8F9A0B1C2D3E4F5A01', JSON.stringify(await column('ref')));
    await columnMenu('hash', ['Display column as', 'UUID (16 bytes)']);
    check('UUID forced for hashes', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test((await column('hash'))[0]), JSON.stringify(await column('hash')));

    // copy value as shown
    await columnMenu('ref', ['Display column as', 'Value (default)']);
    await (await cell(1, 'ref')).click({button: 'right'});
    await page.getByRole('menuitem', {name: 'Copy value', exact: true}).click();
    await page.waitForTimeout(300);
    check('UUID copied', await page.evaluate(() => navigator.clipboard.readText()) === '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c02');
    await columnMenu('hash', ['Display column as', 'Value (default)']);
  }

  if (engine === 'mariadb') {
    // --- native UUID type
    await openTable('uuid_native_test');
    const nativeIds = await column('id');
    check('native uuid shown as text', nativeIds.includes('3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01'), JSON.stringify(nativeIds));
    await editText(await rowOf('name', 'first'), 'name', 'first edited');
    await submit();
    await reload();
    check('edit by native uuid key saved', (await column('name')).includes('first edited'), JSON.stringify(await column('name')));
    await openTable('uuid_native_child');
    await (await cell(0, 'parent_id')).locator('.dtc-reference').click();
    await page.waitForTimeout(1500);
    check('native uuid foreign key opens parent', await rows().count() === 1 && await cellText(0, 'name') === 'first edited', `${await rows().count()} row(s)`);
  }

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
