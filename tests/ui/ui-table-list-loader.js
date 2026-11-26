// Loader of list of tables in sidebar: shown until the server tells the end of the list (TABLES_LIST_FINISHED),
// "No tables" for an empty database, list of PostgreSQL schema ends too.
// node ui-table-list-loader.js   (tests/run.sh creates empty database emptylist on MariaDB before)
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};

const login = async (connection) => (await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();

(async () => {
  const maria = {id: 'loader-maria', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Loader Maria', changeConfirmationRequired: false};
  const pg = {id: 'loader-pg', dsn: 'postgresql://postgres:5432/shop', username: 'flase', displayName: 'Loader PG', changeConfirmationRequired: false};
  const users = {[maria.id]: await login(maria), [pg.id]: await login(pg)};
  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1400, height: 800}})).newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://localhost:3000');
  await page.evaluate(([connections, users]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify(connections));
    localStorage.setItem('established_connections', JSON.stringify(Object.fromEntries(connections.map((c) => [c.id, {user: users[c.id], connection: c}]))));
  }, [[maria, pg], users]);
  await page.reload();
  await page.waitForTimeout(1000);

  const loader = () => page.locator('.table-list-state', {hasText: 'Loading tables'});
  const items = () => page.locator('.table-list-content > ul > li:not(.table-list-state)');
  /** records whether the loader was in the page at any moment - the list of a local database can load in a few frames */
  const watchLoader = () => page.evaluate(() => {
    window.loaderSeen = false;
    new MutationObserver(() => {
      if ([...document.querySelectorAll('.table-list-state')].some((item) => /Loading tables/.test(item.textContent))) window.loaderSeen = true;
    }).observe(document.body, {childList: true, subtree: true});
  });

  // MariaDB - database of 2000 tables
  await page.getByText('Loader Maria', {exact: true}).first().click();
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.getByText('many_tables', {exact: true}).first().waitFor();
  await watchLoader();
  await page.getByText('many_tables', {exact: true}).first().click();
  await loader().waitFor({state: 'detached'});
  check('loader shown while list loads', await page.evaluate(() => window.loaderSeen));
  check('loader gone with all tables listed', await items().count() === 2000, String(await items().count()));
  check('no "No tables" for full database', await page.locator('.table-list-state', {hasText: 'No tables'}).count() === 0);
  await page.screenshot({path: `${OUT}/loader-01-many.png`});

  // columns of the list are loaded too (they come at the end, by two queries of the whole database)
  await page.getByText('many_tables', {exact: true}).first().click();
  await page.getByText('shop', {exact: true}).first().click();
  await loader().waitFor({state: 'detached'});
  await page.getByText('orders', {exact: true}).first().click();
  await page.locator('.data-table-row').first().waitFor();
  check('table of loaded list opens', await page.locator('.data-table-row').count() > 0);

  // empty database
  await watchLoader();
  await page.getByText('emptylist', {exact: true}).first().click();
  await page.locator('.table-list-state', {hasText: 'No tables'}).waitFor({timeout: 10000}).catch(() => undefined);
  check('empty database shows "No tables"', await page.locator('.table-list-state', {hasText: 'No tables'}).count() === 1 && await loader().count() === 0);
  await page.screenshot({path: `${OUT}/loader-02-empty.png`});

  // PostgreSQL schema - its list ends as well
  await page.getByText('Loader PG', {exact: true}).first().click();
  await page.locator('button[title="Load database list"]').last().dispatchEvent('mousedown');
  await page.getByText('public', {exact: true}).first().waitFor();
  await watchLoader();
  await page.getByText('public', {exact: true}).first().click();
  await page.waitForFunction(() => document.querySelectorAll('.table-list-content > ul > li:not(.table-list-state)').length > 0);
  await loader().waitFor({state: 'detached'});
  check('PostgreSQL list ends without loader', await loader().count() === 0 && await items().count() > 0, String(await items().count()));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})();
