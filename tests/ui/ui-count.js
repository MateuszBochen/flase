// Rows of grid in footer: exact count, estimate when count takes more than 3 s, Count button, cancel of count.
// node ui-count.js
// Slow count without big table: condition sleeps per row - first page (100 rows) is fast, COUNT of 500 rows takes 4 s.
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const SLOW = 'SELECT * FROM orders WHERE SLEEP(0.008) = 0';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 300) : ''}`);
};

(async () => {
  const connection = {id: 'count', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Count test', changeConfirmationRequired: false};
  const res = await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})});
  const user = await res.json();

  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1500, height: 900}})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
  }, [connection, user]);
  await page.reload();
  await page.waitForTimeout(1500);
  await page.getByText('Count test', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(1000);

  const visibleTab = () => page.locator('.table-records-root:visible');
  const footer = () => visibleTab().locator('.pager-info');
  const footerText = async () => (await footer().innerText()).replace(/\s+/g, ' ');
  const total = () => footer().locator('.pager-total');
  const countButton = () => footer().locator('.pager-count');
  const rows = () => visibleTab().locator('.data-table-row');
  const runQuery = async (sql) => {
    await visibleTab().locator('.monaco-editor').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(sql, {delay: 2});
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
  };

  // --- exact count
  await page.getByText('orders', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForFunction(() => document.querySelector('.table-records-root .pager-total')?.textContent === '500', null, {timeout: 10000}).catch(() => {});
  check('exact count of table', (await total().textContent()) === '500' && !(await countButton().count()), await footerText());
  check('title with time of count', /^Counted in \d+ ms$/.test(await total().getAttribute('title') || ''), await total().getAttribute('title'));

  // --- slow count: rows first, then estimate
  await page.waitForFunction(() => !!document.querySelector('.table-records-root .monaco-editor'), null, {timeout: 10000});
  await runQuery(`${SLOW} LIMIT 0, 100`);
  const started = Date.now();
  await page.waitForFunction(() => /Records:\s*0 - 100\b/.test(document.querySelector('.table-records-root .pager-info')?.textContent || ''), null, {timeout: 10000});
  const rowsAfter = Date.now() - started;
  check('rows are shown before count', (await rows().count()) > 0 && rowsAfter < 2500 && ['…', '0'].includes(await total().textContent()), `${rowsAfter} ms, ${await footerText()}`);
  await countButton().waitFor({timeout: 8000}).catch(() => {});
  check('estimate after time limit, with Count button', /^(≈ [\d,]+|\?)$/.test(await total().textContent()) && (await countButton().count()) === 1
    && /Estimate of database/.test(await total().getAttribute('title') || ''), await footerText());
  await page.screenshot({path: `${OUT}/count-01-estimate.png`});

  // --- next page without exact total
  await visibleTab().locator('.cmp-records-view-pager-item.pager button').nth(1).click();
  await page.waitForFunction(() => /Records:\s*100 - 200\b/.test(document.querySelector('.table-records-root .pager-info')?.textContent || ''), null, {timeout: 10000}).catch(() => {});
  await page.waitForTimeout(300);
  check('next page with estimate', /Records: 100 - 200/.test(await footerText()) && (await countButton().count()) === 1, await footerText());

  // --- exact count on request
  await countButton().click();
  await page.waitForTimeout(200);
  check('counting is shown with Cancel', /Counting…/.test(await footerText()) && await footer().locator('.pager-cancel').count() === 1, await footerText());
  await page.waitForFunction(() => document.querySelector('.table-records-root .pager-total')?.textContent === '500', null, {timeout: 15000}).catch(() => {});
  check('Count counts exactly', (await total().textContent()) === '500' && !(await countButton().count()) && !/Counting/.test(await footerText()), await footerText());
  await page.screenshot({path: `${OUT}/count-02-exact.png`});

  // --- cancel of count keeps estimate
  await runQuery(`${SLOW} AND 1 = 1 LIMIT 0, 100`);
  await page.waitForTimeout(500);
  await countButton().waitFor({timeout: 10000}).catch(() => {});
  const estimate = await total().textContent();
  await countButton().click();
  await page.waitForTimeout(500);
  await footer().locator('.pager-cancel').click();
  await page.getByText(/Rows were not counted/).first().waitFor({timeout: 5000}).catch(() => {});
  check('cancelled count - toast, estimate stays', await page.getByText(/Rows were not counted/).count() > 0 && (await total().textContent()) === estimate && (await countButton().count()) === 1, `${estimate} ${await footerText()}`);

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
