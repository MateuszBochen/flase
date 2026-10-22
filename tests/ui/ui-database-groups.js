// Databases with the same prefix are grouped in sidebar (MariaDB databases, databases of PostgreSQL server):
// groups, group in group, open state after reload, database opened inside group, grouping turned off
// node ui-database-groups.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const API = 'http://localhost:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MARIA = ['tenant_alpha', 'tenant_beta', 'tenant_gamma', 'client_x_1', 'client_x_2', 'client_x_3', 'client_y_1', 'client_y_2', 'client_z', 'app_prod', 'app_dev'];
const PG = ['grp_one', 'grp_two', 'grp_three'];

const login = async (connection, password) => (await fetch(`${API}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({userData: {username: connection.username, password}, connectionData: connection})})).json();

const execute = async (user, connection, statements) => {
  const ws = new WebSocket(`${API.replace('http', 'ws')}/ws/${user.token}`);
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  const done = new Promise((resolve) => ws.addEventListener('message', (m) => JSON.parse(m.data).message === 'EXECUTION_FINISHED' && resolve()));
  ws.send(JSON.stringify({connectionData: {user, connection}, command: 'EXECUTE_STATEMENTS', payload: {tabId: 'groups', database: null, statements}}));
  await done;
  ws.close();
};

(async () => {
  // root - creates databases and sees all of them
  const maria = {id: 'ui-groups-maria', dsn: 'mysql://mariadb', username: 'root', displayName: 'Groups', changeConfirmationRequired: false};
  const pg = {id: 'ui-groups-pg', dsn: 'postgresql://postgres:5432', username: 'flase', displayName: 'PG groups', changeConfirmationRequired: false};
  const mariaUser = await login(maria, 'root');
  const pgUser = await login(pg, 'flase');
  await execute(mariaUser, maria, MARIA.map((name) => `CREATE DATABASE IF NOT EXISTS \`${name}\``));
  for (const name of PG) await execute(pgUser, pg, [`DROP DATABASE IF EXISTS "${name}"`, `CREATE DATABASE "${name}"`]);

  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1400, height: 1000}})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:3000');
  await page.evaluate(([maria, pg, mariaUser, pgUser]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([maria, pg]));
    localStorage.setItem('established_connections', JSON.stringify({[maria.id]: {user: mariaUser, connection: maria}, [pg.id]: {user: pgUser, connection: pg}}));
  }, [maria, pg, mariaUser, pgUser]);
  await page.reload();
  await sleep(1500);

  const label = (text) => page.locator('.vertical-slider-label', {hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)});
  /** labels of items directly in list of connection (not in groups) */
  const topLevel = () => page.locator('.vertical-slider-item:has(> .vertical-slider-label:text-is("Groups")) .vertical-slider-item-component > div > div > .vertical-slider-root > ul > .vertical-slider-item > .vertical-slider-label').allInnerTexts();
  const groupItem = (prefix) => page.locator('.vertical-slider-item.group').filter({has: page.locator(`> .vertical-slider-label:text-is("${prefix}")`)}).first();
  const childLabels = (prefix) => groupItem(prefix).locator('> .vertical-slider-item-component > .vertical-slider-root > ul > .vertical-slider-item > .vertical-slider-label').allInnerTexts();

  await page.getByText('Groups', {exact: true}).click();
  await sleep(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await sleep(1500);

  // --- groups of MariaDB databases
  const groups = await page.locator('.vertical-slider-item.group > .vertical-slider-label').allInnerTexts();
  check('groups of 3+ databases with the same prefix', JSON.stringify(groups) === JSON.stringify(['client_', 'tenant_']), JSON.stringify(groups));
  check('group shows count', (await groupItem('client_').locator('> .vertical-slider-group-count').innerText()).trim() === '6' && (await groupItem('tenant_').locator('> .vertical-slider-group-count').innerText()).trim() === '3');
  const visible = await page.locator('.vertical-slider-label:visible').allInnerTexts();
  check('2 databases with prefix are not grouped, others stay', ['app_dev', 'app_prod', 'shop', 'blog', 'information_schema'].every((name) => visible.includes(name))
    && !visible.includes('tenant_alpha'), JSON.stringify(visible));
  await page.screenshot({path: `${OUT}/database-groups-01.png`, clip: {x: 0, y: 0, width: 420, height: 700}});

  await groupItem('client_').locator('> .vertical-slider-label').click();
  await sleep(400);
  const client = await childLabels('client_');
  check('group in group (client_x_), single ones stay', JSON.stringify(client) === JSON.stringify(['client_x_', 'client_y_1', 'client_y_2', 'client_z']), JSON.stringify(client));
  await groupItem('client_x_').locator('> .vertical-slider-label').click();
  await sleep(400);
  check('inner group shows its databases', JSON.stringify(await childLabels('client_x_')) === JSON.stringify(['client_x_1', 'client_x_2', 'client_x_3']));
  await label('client_x_2').click();
  await sleep(1200);
  check('database opened inside group shows tables', (await groupItem('client_x_').locator('.cmp-table-list-menu, .table-list-filter').count()) > 0
    || (await page.locator('.vertical-slider-item.active:has(> .vertical-slider-label:text-is("client_x_2")) .table-list-filter').count()) > 0);
  await page.screenshot({path: `${OUT}/database-groups-02-open.png`, clip: {x: 0, y: 0, width: 420, height: 700}});

  // --- open groups and database remembered after reload
  await page.reload();
  await sleep(2500);
  check('open groups and database restored after reload', await label('client_x_2').isVisible() && await label('client_x_1').isVisible()
    && await page.locator('.vertical-slider-item.active:has(> .vertical-slider-label:text-is("client_x_2"))').count() === 1);

  // --- grouping turned off in context menu
  await groupItem('tenant_').locator('> .vertical-slider-label').click({button: 'right'});
  await sleep(300);
  await page.getByText('Do not group databases by prefix').click();
  await sleep(500);
  check('grouping off: flat list', await page.locator('.vertical-slider-item.group').count() === 0 && await label('tenant_beta').isVisible() && await label('client_x_3').isVisible());
  await label('shop').click({button: 'right'});
  await sleep(300);
  await page.getByText('Group databases by prefix').click();
  await sleep(500);
  check('grouping on again', await page.locator('.vertical-slider-item.group > .vertical-slider-label:text-is("tenant_")').count() === 1);

  // --- databases of PostgreSQL server
  await page.getByText('PG groups', {exact: true}).click();
  await sleep(300);
  await page.locator('button[title="Load databases of server"]').first().dispatchEvent('mousedown');
  await sleep(1500);
  const pgGroup = page.locator('.cmp-catalog-list .vertical-slider-item.group').filter({has: page.locator('> .vertical-slider-label:text-is("grp_")')});
  check('PostgreSQL databases grouped', await pgGroup.count() === 1 && await label('shop').count() >= 1, await page.locator('.cmp-catalog-list').innerText());
  await pgGroup.locator('> .vertical-slider-label').click();
  await sleep(400);
  await pgGroup.locator('.vertical-slider-label:text-is("grp_two")').click();
  await sleep(2000);
  check('database of group connects and shows schemas', (await pgGroup.innerText()).includes('public'), await pgGroup.innerText());
  await page.screenshot({path: `${OUT}/database-groups-03-postgres.png`, clip: {x: 0, y: 0, width: 420, height: 900}});

  check('no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  await execute(mariaUser, maria, MARIA.map((name) => `DROP DATABASE IF EXISTS \`${name}\``));
  for (const name of PG) await execute(pgUser, pg, [`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`]);
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
