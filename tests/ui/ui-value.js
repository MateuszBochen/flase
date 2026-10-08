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
  const context = await browser.newContext({viewport: {width: 1500, height: 900}, permissions: ['clipboard-read', 'clipboard-write']});
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

  await page.getByText('value_test', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  const openEditor = async (row, name) => {
    await (await cell(row, name)).click({button: 'right'});
    await page.getByRole('menuitem', {name: 'Open value editor…'}).click();
    await page.waitForTimeout(300);
  };
  const editor = () => page.locator('.cmp-value-editor');

  // cells
  check('short binary shown as hex', (await (await cell(0, 'bin')).innerText()).trim() === '0x00FF10A0', await (await cell(0, 'bin')).innerText());
  check('blob shown with size', (await (await cell(1, 'data')).innerText()).trim() === '[BLOB 2.3 KiB]', await (await cell(1, 'data')).innerText());

  // JSON format / minify / save
  await openEditor(0, 'doc');
  const textarea = editor().locator('textarea');
  await editor().getByRole('button', {name: 'Format JSON'}).click();
  const formatted = await textarea.inputValue();
  check('format JSON', formatted.split('\n').length > 5 && formatted.includes('  "address": {'), formatted.slice(0, 60));
  await page.screenshot({path: `${OUT}/85-json.png`});
  await editor().getByRole('button', {name: 'Minify'}).click();
  check('minify JSON', !(await textarea.inputValue()).includes('\n'));
  await textarea.fill('{"name": "Ola", ');
  check('invalid JSON detected', await editor().locator('.value-editor-error').count() === 1);
  await textarea.fill('{"name": "Ola"}');
  await page.getByRole('button', {name: 'Save'}).click();
  await page.waitForTimeout(300);
  check('saved into pending change', (await (await cell(0, 'doc')).innerText()).includes('Ola') && await rows().nth(0).locator('.data-table-cell.changed').count() === 1);

  // long text with new lines
  await openEditor(1, 'body');
  check('multi line text kept', (await editor().locator('textarea').inputValue()) === 'line 1\nline 2');
  await page.getByRole('button', {name: 'Cancel'}).click();

  // blob as text and as hex dump
  await openEditor(0, 'data');
  check('blob with text shown as text', (await editor().locator('pre').innerText()).trim() === 'plain text in blob' && await page.getByRole('button', {name: 'Save'}).count() === 0);
  await page.getByRole('button', {name: 'Close'}).click();
  await openEditor(1, 'data');
  const dump = await editor().locator('pre').innerText();
  await page.screenshot({path: `${OUT}/86-hex.png`});
  check('binary blob as hex dump', dump.startsWith('00000000  de ad be ef de ad be ef') && (await editor().locator('.value-editor-info').innerText()).includes('2.3 KiB'), dump.slice(0, 60));
  check('text view disabled for binary', await editor().getByRole('button', {name: 'Text'}).isDisabled());
  await page.getByRole('button', {name: 'Close'}).click();

  // binary cell has no quick filter / FK entries
  await (await cell(1, 'data')).click({button: 'right'});
  const items = await page.getByRole('menuitem').allInnerTexts();
  check('no filter for binary', !items.some((t) => t.startsWith('Filter:')), JSON.stringify(items));
  await page.keyboard.press('Escape');

  // submit JSON change
  await grid().getByRole('button', {name: 'Submit'}).click();
  await page.waitForTimeout(1500);
  check('JSON change saved', (await (await cell(0, 'doc')).innerText()).includes('Ola') && await grid().locator('.pending-count').count() === 0);

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
