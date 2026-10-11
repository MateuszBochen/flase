// UI of server: live monitor, status variables, variables with change, advisor, charsets and engines. node ui-server.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const BASE = 'http://localhost:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 300) : ''}`);
};

const login = async (connection, username, password) => (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({userData: {username, password}, connectionData: connection})})).json();

(async () => {
  const connection = {id: 'ui-server', dsn: 'mysql://mariadb', username: 'root', displayName: 'UI maria', changeConfirmationRequired: false};
  const user = await login(connection, 'root', 'root');
  const browser = await chromium.launch();
  const context = await browser.newContext({viewport: {width: 1500, height: 900}, permissions: ['clipboard-read', 'clipboard-write']});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

  const open = async (connection, user, name) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(([connection, user]) => {
      localStorage.clear();
      localStorage.setItem('connections', JSON.stringify([connection]));
      localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
    }, [connection, user]);
    await page.reload();
    await page.waitForTimeout(1500);
    await page.getByText(name, {exact: true}).first().click();
    await page.waitForTimeout(300);
    await page.locator('button[title="Server status, variables and advisor"]').first().dispatchEvent('mousedown');
    await page.waitForTimeout(1500);
  };
  const popup = () => page.locator('.popup-root.open').last();
  const server = () => page.locator('.cmp-server-status:visible');
  const view = async (label) => {
    await server().getByRole('tab', {name: label, exact: true}).click();
    await page.waitForTimeout(800);
  };
  const legend = (title) => server().locator('.server-chart', {has: page.locator('.server-chart-title', {hasText: title})}).locator('.server-chart-legend').innerText();

  await open(connection, user, 'UI maria');
  const cards = await server().locator('.server-cards').innerText();
  check('monitor cards', /Uptime/.test(cards) && /Connections/.test(cards) && /Queries \/ s/.test(cards) && /Traffic \/ s/.test(cards) && /Buffer pool hit ratio/.test(cards), cards);
  check('version and uptime in toolbar', /up \d/.test(await server().locator('.server-chip').innerText()));
  await page.waitForTimeout(5000);
  const queries = await legend('Queries per second');
  check('live chart of queries has values', /Queries\s*[\d.,]+/.test(queries) && await server().locator('.server-chart path[d^="M"]').count() >= 3, queries);
  check('statements chart', /SELECT/.test(await legend('Statements per second')) && /DELETE/.test(await legend('Statements per second')));
  await page.screenshot({path: `${OUT}/server-01-monitor.png`});

  await server().getByRole('button', {name: 'Pause'}).click();
  const pausedCount = await page.evaluate(() => document.querySelectorAll('.server-chart path').length);
  const timeBefore = await server().locator('.server-chart-time').first().innerText();
  await page.waitForTimeout(2500);
  check('pause stops readings', await server().locator('.server-chart-time').first().innerText() === timeBefore && pausedCount > 0);
  await server().getByRole('button', {name: 'Resume'}).click();

  // --- status variables
  await view('Status variables');
  await server().getByLabel('Filter status').fill('com_select, threads_connected');
  await page.waitForTimeout(300);
  const statusRows = await server().locator('.server-status-variables tbody td.name').allInnerTexts();
  check('status variables filtered', statusRows.includes('Com_select') && statusRows.includes('Threads_connected') && statusRows.length === 2, statusRows.join());

  // --- variables: change and reset
  await view('Variables');
  await server().getByLabel('Filter variables').fill('max_connect_errors');
  await page.waitForTimeout(300);
  const row = server().locator('.server-variables tbody tr', {hasText: 'max_connect_errors'});
  check('variable with description and default', await row.count() === 1 && /100/.test(await row.innerText()) && (await row.locator('td.description').innerText()).length > 10, await row.innerText());
  await row.dblclick();
  await page.waitForTimeout(400);
  check('change popup', /Change max_connect_errors/.test(await popup().locator('.popup-name').innerText()));
  await popup().getByLabel('Value').fill('150');
  await popup().getByRole('button', {name: 'Preview SQL'}).click();
  await page.waitForTimeout(600);
  check('change preview', (await popup().locator('.cmp-sql-preview').innerText()) === 'SET GLOBAL max_connect_errors = 150;', await popup().locator('.cmp-sql-preview').innerText());
  await popup().getByRole('button', {name: 'Execute'}).click();
  await page.waitForTimeout(1200);
  check('variable changed', (await row.locator('td.value').innerText()) === '150', await row.innerText());
  await row.click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Change value…'}).click();
  await page.waitForTimeout(300);
  await popup().getByRole('button', {name: 'Reset to default'}).click();
  await page.waitForTimeout(600);
  check('reset preview', (await popup().locator('.cmp-sql-preview').innerText()) === 'SET GLOBAL max_connect_errors = DEFAULT;');
  await popup().getByRole('button', {name: 'Execute'}).click();
  await page.waitForTimeout(1200);
  check('variable back to default', (await row.locator('td.value').innerText()) === '100', await row.innerText());
  await server().getByLabel('Filter variables').fill('');
  await server().getByText('Only changed from default').click();
  await page.waitForTimeout(300);
  const changed = await server().locator('.server-variables tbody tr').count();
  check('only changed variables', changed > 0 && changed < 200, changed);
  await server().getByText('Only changed from default').click();
  await page.waitForTimeout(300);
  check('read only variable not editable', /read only/.test(await server().locator('.server-variables tbody tr', {has: page.locator('td.name', {hasText: /^version(restart|read only)/})}).first().innerText()));

  // --- advisor
  await view('Advisor');
  await page.waitForTimeout(800);
  const advice = await server().locator('.server-advisor').innerText();
  check('advisor shows advice', /Slow query log is disabled/.test(advice), advice.slice(0, 300));
  await page.screenshot({path: `${OUT}/server-02-advisor.png`});
  await server().locator('.server-advice', {hasText: 'Slow query log'}).getByRole('button', {name: 'Change slow_query_log'}).click();
  await page.waitForTimeout(800);
  check('advisor opens variable change', /Change slow_query_log/.test(await popup().locator('.popup-name').innerText()) && await popup().locator('select[aria-label="Value"]').count() === 1
    && await server().getByLabel('Filter variables').inputValue() === 'slow_query_log');
  await popup().getByRole('button', {name: 'Cancel'}).click();

  // --- replication of MariaDB without binary log
  await view('Replication');
  const mariaReplication = await server().locator('.server-replication').innerText();
  check('MariaDB replication: standalone, binary log disabled', /Role\s*standalone/.test(mariaReplication) && /Binary logging is disabled/.test(mariaReplication)
    && /This server does not replicate/.test(mariaReplication), mariaReplication.slice(0, 300));

  // --- charsets and engines
  await view('Charsets & engines');
  const info = await server().locator('.server-info').innerText();
  check('engines and charsets', /Storage engines/.test(info) && /InnoDB/.test(info) && /Character sets/.test(info) && /utf8mb4/.test(info), info.slice(0, 200));
  await server().getByLabel('Filter collations').fill('utf8mb4_bin');
  await page.waitForTimeout(300);
  check('collations filtered', (await server().locator('.server-info .structure-section', {hasText: 'Collations'}).locator('tbody tr').count()) === 1);

  // --- view restored after reload
  await page.reload();
  await page.waitForTimeout(2500);
  check('server tab and view restored', await page.locator('.cmp-server-status:visible .server-views button.active').innerText() === 'Charsets & engines');

  // --- PostgreSQL
  const pg = {id: 'ui-server-pg', dsn: 'postgresql://postgres:5432/shop', username: 'flase', displayName: 'UI pg', changeConfirmationRequired: false};
  await open(pg, await login(pg, 'flase', 'flase'), 'UI pg');
  if (await server().getByRole('tab', {name: 'Monitor', exact: true}).count()) await view('Monitor');
  const pgCards = await server().locator('.server-cards').innerText();
  check('PostgreSQL monitor', /Transactions \/ s/.test(pgCards) && /Cache hit ratio/.test(pgCards) && /Idle in transaction/.test(pgCards) && !/Traffic/.test(pgCards), pgCards);
  await view('Variables');
  await server().getByLabel('Filter variables').fill('work_mem');
  await page.waitForTimeout(300);
  const workMem = server().locator('.server-variables tbody tr', {hasText: /^work_mem/}).first();
  check('PostgreSQL setting with unit and source', /4MB/.test(await workMem.innerText()) && /default/.test(await workMem.innerText()), await workMem.innerText());
  await server().getByLabel('Filter variables').fill('shared_buffers');
  await page.waitForTimeout(300);
  check('restart badge', /restart/.test(await server().locator('.server-variables tbody tr', {hasText: 'shared_buffers'}).first().innerText()));
  await view('Replication');
  const pgReplication = await server().locator('.server-replication').innerText();
  check('PostgreSQL replication: WAL files, slots, publications', /WAL level\s*replica/.test(pgReplication) && /WAL files/.test(pgReplication)
    && await server().locator('.server-logs tbody tr').count() > 0 && /No replication slot/.test(pgReplication) && /Switch WAL/.test(pgReplication), pgReplication.slice(0, 300));
  await view('Charsets & engines');
  const pgInfo = await server().locator('.server-info').innerText();
  check('PostgreSQL databases, extensions, access methods', /Databases/.test(pgInfo) && /shop/.test(pgInfo) && /plpgsql/.test(pgInfo) && /Access methods/.test(pgInfo) && /heap/.test(pgInfo), pgInfo.slice(0, 200));
  await page.screenshot({path: `${OUT}/server-03-postgres.png`});

  // --- MySQL: binary logs and their events
  const my = {id: 'ui-server-my', dsn: 'mysql://mysql', username: 'root', displayName: 'UI mysql', changeConfirmationRequired: false};
  await open(my, await login(my, 'root', 'root'), 'UI mysql');
  await view('Replication');
  await page.waitForTimeout(800);
  const myReplication = await server().locator('.server-replication').innerText();
  const logs = await server().locator('.server-logs tbody tr').count();
  check('MySQL binary logs', /Binary log\s*ON/.test(myReplication) && /Current position\s*binlog\.\d+:\d+/.test(myReplication) && logs > 0, myReplication.slice(0, 300));
  await server().locator('.server-logs tbody tr').last().click();
  await page.waitForTimeout(1000);
  const events = await server().locator('.server-events tbody tr').count();
  check('events of binary log', events > 0 && /Format_desc/.test(await server().locator('.server-events tbody tr').first().innerText()), events);
  await server().getByRole('button', {name: 'New binary log'}).click();
  await page.waitForTimeout(600);
  check('flush preview', (await popup().locator('.cmp-sql-preview').innerText()) === 'FLUSH BINARY LOGS;');
  await popup().getByRole('button', {name: 'Execute'}).click();
  await page.waitForTimeout(1500);
  check('new binary log listed', await server().locator('.server-logs tbody tr').count() === logs + 1);
  await server().locator('.server-logs tbody tr').last().click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Delete logs before this one…'}).click();
  await page.waitForTimeout(600);
  check('purge preview needs hold', /^PURGE BINARY LOGS TO 'binlog\.\d+';$/.test(await popup().locator('.cmp-sql-preview').innerText())
    && await popup().getByRole('button', {name: 'Hold to execute'}).count() === 1);
  await popup().getByRole('button', {name: 'Cancel'}).click();
  await page.screenshot({path: `${OUT}/server-04-replication.png`, fullPage: true});

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
