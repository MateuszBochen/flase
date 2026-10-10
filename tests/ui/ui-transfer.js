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

  const fs = require('fs');
  const transfer = () => page.locator('.cmp-transfer:visible');
  const exportPanel = () => transfer().locator('.transfer-panel').nth(0);
  const importPanel = () => transfer().locator('.transfer-panel').nth(1);
  const importFile = async (name, content) => {
    await importPanel().locator('input[type="file"]').setInputFiles({name, mimeType: 'application/octet-stream', buffer: Buffer.from(content)});
    await page.waitForTimeout(500);
  };
  const runImport = async () => {
    await importPanel().getByRole('button', {name: 'Start import'}).click();
    for (let i = 0; i < 100 && await importPanel().getByRole('button', {name: 'Importing…'}).count(); i++) await page.waitForTimeout(100);
    await page.waitForTimeout(300);
    return (await importPanel().locator('.import-progress').innerText()).replace(/\s+/g, ' ');
  };

  await page.locator('.table-list-filter button[title="Import / export shop"]').dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  check('transfer tab opened', await transfer().count() === 1);
  await page.screenshot({path: `${OUT}/a1-transfer.png`, fullPage: true});

  // --- export one table
  await exportPanel().locator('.select-all input').uncheck();
  await exportPanel().locator('.transfer-table-list label', {hasText: /^edit_test$/}).locator('input').check();
  const [download] = await Promise.all([
    page.waitForEvent('download', {timeout: 15000}),
    exportPanel().getByRole('button', {name: 'Download dump'}).click(),
  ]);
  const dump = fs.readFileSync(await download.path(), 'utf8');
  await page.waitForTimeout(800);
  check('dump of selected table', /^shop-edit_test-\d{8}-\d{4}\.sql$/.test(download.suggestedFilename()) && dump.includes('CREATE TABLE `edit_test`') && !dump.includes('CREATE TABLE `orders`') && (dump.match(/^INSERT INTO `edit_test`/m) || []).length === 1, download.suggestedFilename());
  check('dump summary shown', /1 table\(s\), 3 row\(s\)/.test(await exportPanel().locator('.transfer-result').innerText()), await exportPanel().locator('.transfer-result').innerText().catch(() => ''));

  await exportPanel().locator('label', {hasText: 'Compress'}).locator('input').check();
  const [gzDownload] = await Promise.all([page.waitForEvent('download', {timeout: 15000}), exportPanel().getByRole('button', {name: 'Download dump'}).click()]);
  check('gzip dump', gzDownload.suggestedFilename().endsWith('.sql.gz') && require('zlib').gunzipSync(fs.readFileSync(await gzDownload.path())).toString().includes('CREATE TABLE `edit_test`'));

  // --- import: break data, restore from dump
  await importFile('break.sql', 'DELETE FROM edit_test;');
  check('sql file recognized', (await importPanel().innerText()).includes('SQL script'));
  let text = await runImport();
  check('delete executed', /1 statement\(s\)/.test(text), text);
  await importFile('restore.sql', dump);
  text = await runImport();
  check('dump imported', /\d+ statement\(s\)/.test(text) && !/stopped/.test(text), text);
  await page.screenshot({path: `${OUT}/a2-import.png`, fullPage: true});
  await page.getByText('edit_test', {exact: true}).first().dispatchEvent('mousedown', {button: 1});
  await page.waitForTimeout(1500);
  await page.locator('[class*="tab-label"]').filter({hasText: 'shop/edit_test'}).last().click();
  await page.waitForTimeout(800);
  const restoredRows = await visibleTab().locator('.data-table-row').allInnerTexts();
  check('rows restored', restoredRows.length === 3 && restoredRows[0].includes('9007199254740993'), JSON.stringify(restoredRows));

  // --- import error
  await page.locator('[class*="tab-label"]').filter({hasText: 'Import / export: shop'}).last().click();
  await importFile('broken.sql', 'SELECT 1;\nSELECT * FROM no_such_table;\nSELECT 2;');
  text = await runImport();
  check('import stops on error', /1 statement\(s\)/.test(text) && /stopped on error/.test(text) && (await importPanel().locator('.import-error-message').innerText()).includes('no_such_table'), text);

  // --- CSV
  await importFile('ddl.sql', 'DROP TABLE IF EXISTS csv_target;\nCREATE TABLE csv_target (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50) NOT NULL, note TEXT NULL, amount DECIMAL(10,2) NULL);');
  await runImport();
  await page.waitForTimeout(1000);
  await importFile('people.csv', 'Name;ignored;NOTE;amount\n"Kowalski; Jan";x;"say ""hi""";10.5\nNowak;x;;\nOla;x;"";3\n');
  check('csv recognized, delimiter detected', (await importPanel().innerText()).includes('CSV') && (await importPanel().locator('label', {hasText: 'Delimiter'}).locator('select').inputValue()) === ';');
  await importPanel().locator('label', {hasText: 'Table'}).locator('select').selectOption('csv_target');
  await page.waitForTimeout(500);
  const mapping = await importPanel().locator('.csv-preview thead select').evaluateAll((items) => items.map((item) => item.value));
  check('columns mapped by header (case insensitive), unknown skipped', JSON.stringify(mapping) === JSON.stringify(['name', '', 'note', 'amount']), JSON.stringify(mapping));
  check('preview rows', (await importPanel().locator('.csv-preview tbody tr').count()) === 4);
  await page.screenshot({path: `${OUT}/a3-csv.png`, fullPage: true});
  text = await runImport();
  check('csv imported', /3 row\(s\)/.test(text) && !/failed/.test(text), text);
  const stillSelected = await exportPanel().locator('.transfer-table-list input:checked').evaluateAll((items) => items.map((item) => item.parentElement.textContent));
  check('export selection kept after table list reload', JSON.stringify(stillSelected) === '["edit_test"]', JSON.stringify(stillSelected));
  await page.getByText('csv_target', {exact: true}).first().dispatchEvent('mousedown', {button: 1});
  await page.waitForTimeout(1500);
  await page.locator('[class*="tab-label"]').filter({hasText: 'shop/csv_target'}).last().click();
  await page.waitForTimeout(800);
  const csvRows = await visibleTab().locator('.data-table-row').allInnerTexts();
  check('csv data', csvRows.length === 3 && csvRows[0].includes('Kowalski; Jan') && csvRows[0].includes('say "hi"') && csvRows[1].includes('NULL') && csvRows[2].includes("''"), JSON.stringify(csvRows));

  // --- from table toolbar
  await page.getByText('edit_test', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  await visibleTab().getByRole('button', {name: 'Import / export table…'}).click();
  await page.waitForTimeout(1200);
  const checked = await transfer().locator('.transfer-table-list input:checked').evaluateAll((items) => items.map((item) => item.parentElement.textContent));
  check('opened from table: only that table selected', JSON.stringify(checked) === '["edit_test"]' && (await transfer().locator('.transfer-title').innerText()).includes('shop.edit_test'), JSON.stringify(checked));

  await page.locator('.tab-label-list-item').filter({hasText: /Import \/ export: shop(?!\.)/}).first().click();
  await importFile('cleanup.sql', 'DROP TABLE csv_target;');
  await runImport();

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
