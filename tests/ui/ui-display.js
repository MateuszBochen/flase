// UI of find and replace in column, labels of referenced rows (display column) and transformations of columns.
// node ui-display.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const BASE = 'http://localhost:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};

// 1x1 PNG, the second image is longer than preview of grid (4096 bytes) - it is loaded whole
const PNG = '89504e470d0a1a0a0000000d4948445200000001000000010806000000'
  + '1f15c4890000000d4944415478da63f8cfc0f01f0005000201ffa5dc2a0f0000000049454e44ae426082';

(async () => {
  const connection = {id: 'ui-display', dsn: 'mysql://mariadb', username: 'flase', displayName: 'UI display', changeConfirmationRequired: false};
  const user = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();
  const browser = await chromium.launch();
  const context = await browser.newContext({viewport: {width: 1500, height: 950}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
  }, [connection, user]);
  const sql = (statements) => page.evaluate(([token, connection, user, statements]) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:3001/ws/${token}`);
    let error = null;
    ws.onopen = () => ws.send(JSON.stringify({connectionData: {user, connection}, command: 'EXECUTE_STATEMENTS', payload: {tabId: 'setup', database: 'shop', statements, stopOnError: false}}));
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.message === 'STATEMENT_FINISHED' && message.payload.error) error = message.payload.error;
      if (message.message === 'EXECUTION_FINISHED' || message.message === 'QUERY_ERROR') {
        ws.close();
        resolve(error);
      }
    };
  }), [user.token, connection, user, statements]);

  check('setup', await sql([
    'DROP TABLE IF EXISTS display_test',
    'CREATE TABLE display_test (id INT PRIMARY KEY, title VARCHAR(50), url VARCHAR(200), created INT, active TINYINT, picture LONGBLOB)',
    `INSERT INTO display_test VALUES (1, 'Hello World', 'https://example.com/page', 1700000000, 1, X'${PNG}'),`
      + ` (2, 'Hello World again', 'not a link', 1700086400, 0, X'${PNG}${'00'.repeat(6000)}'), (3, 'abc', NULL, NULL, NULL, NULL)`,
  ]) === null);
  await page.reload();
  await page.waitForTimeout(1500);

  const popup = () => page.locator('.popup-root.open').last();
  const hold = async (button) => {
    const box = await button.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1800);
    await page.mouse.up();
  };
  const grid = () => page.locator('.cmp-records-view:visible');
  const cell = (row, column) => grid().locator(`.data-table-row[data-row="${row}"] .data-table-cell`).nth(column);
  const columnMenu = async (row, column, path) => {
    await cell(row, column).click({button: 'right'});
    for (const label of path.slice(0, -1)) {
      await page.getByRole('menuitem', {name: label, exact: true}).hover();
      await page.waitForTimeout(250);
    }
    await page.getByRole('menuitem', {name: path[path.length - 1], exact: true}).click();
    await page.waitForTimeout(1200);
  };
  const openTable = async (table) => {
    await page.locator('.table-list-menu-root li', {hasText: new RegExp(`^${table}$`)}).locator('button').dispatchEvent('mousedown');
    await page.waitForTimeout(1500);
  };

  await page.getByText('UI display', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.locator('.vertical-slider-label', {hasText: /^shop$/}).click();
  await page.waitForTimeout(1000);

  // --- find and replace
  await openTable('display_test');
  await page.locator('.table-records-root:visible button[title="Find and replace…"]').dispatchEvent('mousedown');
  await page.waitForTimeout(400);
  check('find and replace form with text columns', /Find and replace in display_test/.test(await popup().locator('.popup-name').innerText())
    && (await popup().getByLabel('Column').locator('option').allTextContents()).join() === 'title (varchar(50)),url (varchar(200))');
  await popup().getByLabel('Find', {exact: true}).fill('World');
  await popup().getByLabel('Replace with').fill('Earth');
  await popup().getByRole('button', {name: 'Preview'}).click();
  await page.waitForTimeout(800);
  const preview = await popup().locator('.find-preview').innerText();
  check('preview of changed rows', /2 row\(s\) will change/.test(preview) && await popup().locator('.find-before mark').first().innerText() === 'World'
    && await popup().locator('.find-after mark').first().innerText() === 'Earth' && /UPDATE `shop`\.`display_test` SET `title` = REPLACE/.test(preview), preview);
  await page.screenshot({path: `${OUT}/display-01-find-replace.png`});
  await popup().getByLabel('Find', {exact: true}).fill('Worl');
  check('changed option hides preview', await popup().locator('.find-preview').count() === 0);
  await popup().getByLabel('Find', {exact: true}).fill('World');
  await popup().getByRole('button', {name: 'Preview'}).click();
  await page.waitForTimeout(800);
  await hold(popup().getByRole('button', {name: 'Hold to replace in 2 row(s)'}));
  await page.waitForTimeout(1500);
  check('replaced and grid reloaded', await page.locator('.popup-root.open').count() === 0 && /Hello Earth/.test(await cell(0, 1).innerText()) && /Hello Earth again/.test(await cell(1, 1).innerText()),
    await cell(0, 1).innerText());

  // --- transformations
  await columnMenu(0, 2, ['Display column as', 'Link (URL, e-mail)']);
  check('link', await cell(0, 2).locator('a.dtc-link').getAttribute('href') === 'https://example.com/page' && await cell(1, 2).locator('a').count() === 0);
  await columnMenu(0, 3, ['Display column as', 'Unix time as date']);
  check('unix time', /^2023-11-1[45] \d\d:\d\d:\d\d$/.test(await cell(0, 3).innerText()), await cell(0, 3).innerText());
  await columnMenu(0, 4, ['Display column as', 'Yes / no (✓ / ✗)']);
  check('yes / no', await cell(0, 4).innerText() === '✓' && await cell(1, 4).innerText() === '✗');
  await columnMenu(0, 5, ['Display column as', 'Image (binary)']);
  await page.waitForTimeout(1000);
  const images = await grid().locator('img.dtc-image').evaluateAll((items) => items.map((item) => item.naturalWidth));
  check('images - from preview and whole value loaded from server', images.length === 2 && images.every((width) => width === 1), JSON.stringify(images));
  await page.screenshot({path: `${OUT}/display-02-transforms.png`});
  await grid().locator('img.dtc-image').nth(1).click();
  await page.waitForTimeout(500);
  check('image shown big', await popup().locator('.cmp-image-preview img').count() === 1 && /picture/.test(await popup().locator('.popup-name').innerText()));
  await popup().getByRole('button', {name: 'Close'}).click();

  // settings stay after reload
  await page.reload();
  await page.waitForTimeout(3000);
  check('transformations remembered', await cell(0, 2).locator('a.dtc-link').count() === 1 && await cell(0, 4).innerText() === '✓');
  await columnMenu(0, 2, ['Display column as', 'Value (default)']);
  check('transformation removed', await cell(0, 2).locator('a').count() === 0 && await cell(0, 2).innerText() === 'https://example.com/page');

  // --- labels of referenced rows
  await openTable('orders');
  await page.waitForTimeout(1500);
  const customerCell = () => cell(0, 1);
  check('label guessed from referenced table (email)', /@/.test(await customerCell().locator('.dtc-label').innerText().catch(() => '')), await customerCell().innerText());
  await columnMenu(0, 1, ['Show from customers', 'last_name']);
  const lastName = await customerCell().locator('.dtc-label').innerText().catch(() => '');
  check('chosen display column', lastName.length > 0 && !/@/.test(lastName), lastName);
  await page.screenshot({path: `${OUT}/display-03-labels.png`});
  await columnMenu(0, 1, ['Show from customers', 'Only key']);
  check('only key', await customerCell().locator('.dtc-label').count() === 0);

  await sql(['DROP TABLE IF EXISTS display_test']);
  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
