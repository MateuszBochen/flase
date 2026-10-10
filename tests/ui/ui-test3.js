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

  const grid = page.locator('.cmp-records-view').last();
  const rows = grid.locator('.data-table-row');
  const editor = page.locator('.monaco-editor').last();
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('SELECT o.id, c.id, c.email FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id < 4 ORDER BY o.id');
  // close autocompletion first - Enter would accept suggestion
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  await page.screenshot({path: `${OUT}/21-join.png`});

  const firstRow = await rows.nth(0).locator('.data-table-cell').allInnerTexts();
  check('both id columns rendered', firstRow.length === 3 && firstRow[0].trim() === '1' && firstRow[1].trim() !== '' && firstRow[1].trim() !== firstRow[0].trim(), JSON.stringify(firstRow));
  const headers = await grid.locator('.header-cell .column-name').allInnerTexts();
  check('headers show plain names', headers.join(',') === 'id,id,email', headers.join(','));

  // sort DESC by second id (c.id)
  await grid.locator('.header-cell').nth(1).locator('.sort-box button').nth(1).dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  const query = await page.locator('.monaco-editor').last().innerText();
  check('sort qualifies repeated column', /ORDER BY `c`\.`id` DESC/.test(query.replace(/\s+/g, ' ')), query.replace(/\s+/g, ' '));
  const ids = (await rows.allInnerTexts()).map((t) => +t.split('\n')[1]);
  check('sorted by customer id desc', ids.length === 3 && ids[0] >= ids[1] && ids[1] >= ids[2], JSON.stringify(ids));
  await page.screenshot({path: `${OUT}/22-join-sorted.png`});

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
