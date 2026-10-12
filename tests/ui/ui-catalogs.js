// PostgreSQL connection without database in DSN: databases of server -> schemas -> tables (like pgAdmin).
// node ui-catalogs.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const BASE = 'http://localhost:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};

(async () => {
  const connection = {id: 'ui-catalogs', dsn: 'postgresql://postgres:5432', username: 'flase', displayName: 'PG server', changeConfirmationRequired: false, color: '#d4b106'};
  const user = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();
  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1500, height: 950}})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
  }, [connection, user]);
  await page.reload();
  await page.waitForTimeout(1500);

  const label = (name) => page.locator('.vertical-slider-label', {hasText: new RegExp(`^${name}$`)});
  const activeTab = () => page.locator('.tab-label-list-item.active').innerText().then((text) => text.split('\n')[0].trim());

  await page.getByText('PG server', {exact: true}).first().click();
  await page.waitForTimeout(300);
  check('no create schema button on server level', await page.locator('button[title="Create schema"]').count() === 0);
  await page.locator('button[title="Load databases of server"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(1000);
  const databases = await page.locator('.cmp-catalog-list > .vertical-slider-root > ul > .vertical-slider-item > .vertical-slider-label').allInnerTexts();
  check('databases of server listed', ['flase_owner', 'postgres', 'shop'].every((name) => databases.includes(name)), databases.join());
  check('size of database shown', /\d+(\.\d)? (KiB|MiB)/.test(await page.locator('.catalog-suffix').first().innerText()), await page.locator('.catalog-suffix').first().innerText());

  // database opened with login of the connection - its schemas and tables
  await label('flase_owner').click();
  await page.waitForTimeout(2000);
  const schemas = await page.locator('.cmp-catalog-list .vertical-slider-item .vertical-slider-item .vertical-slider-label').allInnerTexts();
  check('schemas of chosen database', schemas.includes('public') && schemas.includes('pg_catalog'), schemas.join());
  await label('public').first().click();
  await page.waitForTimeout(1500);
  const tables = await page.locator('.table-list-menu-root li').allInnerTexts();
  check('tables of Hibernate database', ['tickets', 'projects', 'flyway_schema_history'].every((name) => tables.includes(name)), tables.join());
  await page.locator('.table-list-menu-root li', {hasText: /^tickets$/}).locator('button').dispatchEvent('mousedown');
  await page.waitForTimeout(2000);
  check('table tab of chosen database', await activeTab() === 'public/tickets' && await page.locator('.cmp-records-view:visible .data-table-row').count() === 3, await activeTab());
  const tabColor = await page.locator('.tab-label-list-item.active').evaluate((element) => getComputedStyle(element).borderTopColor);
  check('tab of database has color of server connection', tabColor === 'rgb(212, 177, 6)', tabColor);
  await page.screenshot({path: `${OUT}/catalogs-01-tree.png`});

  // console of chosen database
  // middle click - new tab, table tab stays
  await page.locator('[title="SQL console of database flase_owner"]').dispatchEvent('mousedown', {button: 1});
  await page.waitForTimeout(1000);
  await page.locator('.tab-label-list-item').filter({hasText: 'Console: PG server / flase_owner'}).first().click();
  await page.waitForTimeout(1500);
  check('console of database', await activeTab() === 'Console: PG server / flase_owner', await activeTab());
  const editor = page.locator('.cmp-sql-console:visible .monaco-editor').first();
  await editor.click();
  await page.keyboard.type('SELECT current_database() AS db');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(1500);
  check('console runs in chosen database', (await page.locator('.cmp-sql-console:visible .data-table-row').first().innerText()).includes('flase_owner'));

  // second database at the same time
  await label('shop').click();
  await page.waitForTimeout(2000);
  const shopSchemas = await page.locator('.cmp-catalog-list > .vertical-slider-root > ul > .vertical-slider-item').filter({has: label('shop')}).locator('.vertical-slider-item .vertical-slider-label').allInnerTexts();
  check('second database open', shopSchemas.includes('public') && shopSchemas.includes('blog'), shopSchemas.join());

  // back to list of databases - click on name, or collapse all
  const chevron = (name) => page.locator('.cmp-catalog-list > .vertical-slider-root > ul > .vertical-slider-item').filter({has: label(name)}).locator('> .vertical-slider-chevron');
  check('arrow of open database', await chevron('shop').innerText() === '▾' && await chevron('postgres').innerText() === '▸');
  await label('shop').click();
  await page.waitForTimeout(500);
  check('click on name closes database', await chevron('shop').innerText() === '▸' && (await page.locator('.cmp-catalog-list .vertical-slider-item.active > .vertical-slider-label').allInnerTexts()).includes('flase_owner'));
  await label('shop').click();
  await page.waitForTimeout(1500);
  await page.locator('button[title="Collapse all databases"]').dispatchEvent('mousedown');
  await page.waitForTimeout(500);
  check('collapse all databases', await page.locator('.cmp-catalog-list .vertical-slider-item.active').count() === 0
    && (await page.locator('.cmp-catalog-list > .vertical-slider-root > ul > .vertical-slider-item > .vertical-slider-label').allInnerTexts()).length >= 3);
  await label('flase_owner').click();
  await label('shop').click();
  await page.waitForTimeout(2000);

  // state after reload - open databases, their connections and tabs
  await page.reload();
  await page.waitForTimeout(4000);
  const reopened = await page.locator('.cmp-catalog-list .vertical-slider-item.active > .vertical-slider-label').allInnerTexts();
  check('open databases restored', reopened.includes('flase_owner') && reopened.includes('shop'), reopened.join());
  await page.locator('.tab-label-list-item').filter({hasText: 'public/tickets'}).first().click();
  await page.waitForTimeout(1500);
  check('table tab of database restored with rows', await page.locator('.cmp-records-view:visible .data-table-row').count() === 3);

  // connection with database in DSN keeps schemas directly
  const established = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('established_connections') || '{}')));
  check('database connections remembered under parent', established.includes('ui-catalogs::flase_owner') && established.includes('ui-catalogs::shop'), established.join());

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
