// Tools of SQL work: sum / average of selected cells, :parameters of console, inspections of SQL (UPDATE without WHERE,
// unknown tables and columns) and execution plan as tree (also with ANALYZE).
// node ui-sql-tools.js <mariadb|mysql|postgres>
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const engine = process.argv[2] || 'mariadb';
const DSN = {mariadb: 'mysql://mariadb', mysql: 'mysql://mysql:3306', postgres: 'postgresql://postgres:5432/shop'}[engine];
const DATABASE = engine === 'postgres' ? 'public' : 'shop';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 500) : ''}`);
};

(async () => {
  const connection = {id: `ui-tools-${engine}`, dsn: DSN, username: 'flase', displayName: 'Tools test', changeConfirmationRequired: false};
  const user = await (await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();
  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1500, height: 900}})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
    localStorage.setItem('open-connections', JSON.stringify([connection.id]));
  }, [connection, user]);
  await page.reload();
  await page.waitForTimeout(1500);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(1000);
  await page.locator('.vertical-slider-label', {hasText: new RegExp(`^${DATABASE}$`)}).first().click();
  await page.waitForTimeout(1500);

  // --- 1. sum, average... of selected cells
  await page.getByText('customers', {exact: true}).first().dispatchEvent('mousedown');
  await page.locator('.table-records-root:visible .data-table-row').first().waitFor();
  const rows = page.locator('.table-records-root:visible .data-table-row');
  const ids = [];
  for (let row = 0; row < 5; row++) ids.push(Number(await rows.nth(row).locator('.data-table-cell').first().innerText()));
  await rows.nth(0).locator('.data-table-cell').first().click();
  await rows.nth(4).locator('.data-table-cell').first().click({modifiers: ['Shift']});
  await page.waitForTimeout(200);
  const stats = await page.locator('.table-records-root:visible .pager-selection-stats').innerText().catch(() => '');
  const sum = ids.reduce((a, b) => a + b, 0);
  check('selection stats of numbers', stats.includes('Count: 5') && stats.includes(`Sum: ${sum}`) && stats.includes(`Min: ${Math.min(...ids)}`) && stats.includes(`Max: ${Math.max(...ids)}`), `${stats} ${ids}`);
  // text cells are counted, not summed
  const emailIndex = (await page.locator('.table-records-root:visible .header-cell .column-name').allInnerTexts()).indexOf('email');
  await rows.nth(0).locator('.data-table-cell').nth(emailIndex).click();
  await rows.nth(2).locator('.data-table-cell').nth(emailIndex).click({modifiers: ['Shift']});
  await page.waitForTimeout(200);
  check('selection of texts only counted', (await page.locator('.table-records-root:visible .pager-selection-stats').innerText()) === 'Count: 3');
  await rows.nth(0).locator('.data-table-cell').first().click();
  await page.waitForTimeout(200);
  check('one cell - no stats', await page.locator('.table-records-root:visible .pager-selection-stats').count() === 0);

  // --- console
  await page.locator(`.table-list-filter button[title="SQL console for ${DATABASE}"]`).dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  const consoleTab = () => page.locator('.cmp-sql-console:visible');
  const setConsoleText = (text) => page.evaluate((text) => {
    const editor = window.monaco.editor.getEditors().find((item) => item.getContainerDomNode().closest('.cmp-sql-console') && item.getContainerDomNode().offsetParent);
    editor.setValue(text);
    const position = editor.getModel().getPositionAt(text.length);
    editor.setPosition(position);
    editor.focus();
  }, text);
  const markers = () => page.evaluate(() => window.monaco.editor.getModelMarkers({owner: 'flase-inspections'}).map((marker) => marker.message));
  const logs = async () => (await consoleTab().locator('.console-log').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
  const waitIdle = async () => { for (let i = 0; i < 100 && await consoleTab().getByRole('button', {name: 'Cancel'}).count(); i++) await page.waitForTimeout(100); await page.waitForTimeout(400); };

  // --- 2. :parameters
  await setConsoleText("SELECT id, email FROM customers WHERE id = :id AND city <> :city AND email <> ':no';");
  await page.keyboard.press('Control+Enter');
  await page.getByLabel('Value of id').waitFor({timeout: 5000});
  check('parameters asked once each, not in strings', await page.locator('.cmp-query-parameters .parameter-name').allInnerTexts().then((names) => names.join() === ':id,:city'));
  await page.getByLabel('Value of id').fill('3');
  await page.getByLabel('id as SQL').check();
  await page.getByLabel('Value of city').fill("O'Neil");
  await page.getByRole('button', {name: 'Execute'}).click();
  await waitIdle();
  await consoleTab().getByRole('tab', {name: /^Messages/}).click();
  let l = await logs();
  check('parameters bound as SQL and text', l.length === 1 && l[0].includes('WHERE id = 3 AND') && /city <> 'O(''|\\')Neil'/.test(l[0]) && /1 row/.test(l[0]), JSON.stringify(l));
  await page.evaluate(() => window.monaco.editor.getEditors().find((item) => item.getContainerDomNode().closest('.cmp-sql-console')).focus());
  await page.keyboard.press('Control+Enter');
  await page.getByLabel('Value of id').waitFor({timeout: 5000});
  check('values offered again', await page.getByLabel('Value of id').inputValue() === '3' && await page.getByLabel('id as SQL').isChecked());
  await page.getByRole('button', {name: 'Cancel'}).click();
  await page.waitForTimeout(200);
  check('cancel of parameters runs nothing', JSON.stringify(await logs()) === JSON.stringify(l));

  // --- 3. inspections
  await setConsoleText('SELECT * FROM custmers;\nSELECT c.mail, c.email FROM customers c;\nSELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id;');
  await page.waitForTimeout(1000);
  let found = await markers();
  check('unknown table and column underlined', found.length === 2 && found.some((m) => /Unknown table custmers/.test(m)) && found.some((m) => /Unknown column mail in c/.test(m)), JSON.stringify(found));
  await page.screenshot({path: `${OUT}/tools-inspections-${engine}.png`});

  await setConsoleText("UPDATE customers SET city = 'x';");
  await page.waitForTimeout(1000);
  found = await markers();
  check('UPDATE without WHERE underlined', found.length === 1 && /without WHERE/.test(found[0]), JSON.stringify(found));
  const before = await logs();
  await page.keyboard.press('Control+Enter');
  await page.getByText('no WHERE - every row of the table is changed').waitFor({timeout: 5000});
  check('UPDATE without WHERE asks before run', await page.getByRole('button', {name: 'Hold to execute'}).count() === 1);
  await page.getByRole('button', {name: 'Cancel'}).click();
  await page.waitForTimeout(300);
  check('cancelled UPDATE not executed', JSON.stringify(await logs()) === JSON.stringify(before));
  // with WHERE it runs at once - nothing changes (no customer has id 0)
  await setConsoleText("UPDATE customers SET city = 'x' WHERE id = 0;");
  await page.keyboard.press('Control+Enter');
  await waitIdle();
  check('UPDATE with WHERE runs without question', (await logs())[0]?.includes('0 row(s) affected'), JSON.stringify(await logs()));

  // --- 5. plan as tree, with ANALYZE
  await setConsoleText('SELECT c.city, COUNT(*) FROM orders o JOIN customers c ON c.id = o.customer_id GROUP BY c.city;');
  await consoleTab().getByRole('button', {name: 'Explain'}).click();
  await page.locator('.cmp-plan-tree .plan-row:not(.plan-header)').first().waitFor({timeout: 10000});
  let plan = await page.locator('.cmp-plan-tree .plan-rows').innerText();
  // MySQL names tables by alias
  const objects = await page.locator('.cmp-plan-tree .plan-object').allInnerTexts();
  check('plan tree has tables of query', objects.some((name) => /^(o|orders)\b/.test(name)) && objects.some((name) => /^(c|customers)\b/.test(name)), JSON.stringify(objects));
  check('plan without analyze has no time column', !/Time/.test(await page.locator('.cmp-plan-tree .plan-header').innerText()));
  await page.getByLabel(/Analyze/).check();
  await page.locator('.cmp-plan-tree .plan-header', {hasText: 'Time'}).waitFor({timeout: 10000});
  plan = await page.locator('.cmp-plan-tree').innerText();
  check('analyze shows actual rows and time', /→\s*\d/.test(plan) && /\d ms/.test(plan), plan);
  await page.locator('.cmp-plan-tree .plan-row:not(.plan-header)').nth(1).click();
  check('details of selected step', (await page.locator('.cmp-plan-tree .plan-details dl').innerText()).length > 10);
  await page.screenshot({path: `${OUT}/tools-plan-${engine}.png`});
  await page.getByRole('button', {name: 'Close'}).click();
  // statement which changes data is not analyzed
  await setConsoleText("UPDATE customers SET city = 'x' WHERE id = 1;");
  await consoleTab().getByRole('button', {name: 'Explain'}).click();
  await page.locator('.cmp-explain').waitFor();
  check('UPDATE cannot be analyzed', await page.getByLabel(/Analyze/).isDisabled());
  await page.getByRole('button', {name: 'Close'}).click();

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})();
