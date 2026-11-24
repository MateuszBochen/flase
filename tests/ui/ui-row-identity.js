// Change of grid is saved to the row it was made in - checked in database, not in grid:
// wide table (columns rendered only near horizontal scroll), reload (PostgreSQL moves updated row to the end of table),
// two rows changed at once, popup editor, table without primary key whose rows differ only in long text.
// node ui-row-identity.js mariadb|postgres
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const API = 'http://localhost:3001';
const engine = process.argv[2] || 'mariadb';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COLUMNS = Array.from({length: 30}, (value, index) => `c${String(index + 1).padStart(2, '0')}`);
const LONG = 70 * 1024; // longer than preview of long text (64 KB) - preview cannot identify row

(async () => {
  const pg = engine === 'postgres';
  const connection = pg
    ? {id: 'ui-row-identity-pg', dsn: 'postgresql://postgres:5432/shop', username: 'flase', displayName: 'Identity test', changeConfirmationRequired: false}
    : {id: 'ui-row-identity', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Identity test', changeConfirmationRequired: false};
  const user = await (await fetch(`${API}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();

  /** rows of statements by own websocket - database state, not grid */
  const sql = async (statements) => {
    const ws = new WebSocket(`${API.replace('http', 'ws')}/ws/${user.token}`);
    await new Promise((resolve) => ws.addEventListener('open', resolve));
    const tabId = 'identity' + Math.random();
    const rows = {};
    const errors = [];
    const done = new Promise((resolve) => ws.addEventListener('message', (m) => {
      const message = JSON.parse(m.data);
      const index = message.payload?.tabId?.startsWith(`${tabId}:`) ? message.payload.tabId.slice(tabId.length + 1) : null;
      if (message.message === 'SELECT_RECORDS' && index !== null) (rows[index] = rows[index] || []).push(...message.payload.rows);
      if (message.message === 'STATEMENT_FINISHED' && message.payload.error) errors.push(message.payload.error);
      if (message.message === 'EXECUTION_FINISHED' && message.payload.tabId === tabId) resolve();
    }));
    ws.send(JSON.stringify({connectionData: {user, connection}, command: 'EXECUTE_STATEMENTS', payload: {tabId, database: pg ? null : 'shop', statements}}));
    await done;
    ws.close();
    if (errors.length) throw new Error(errors.join(' | '));
    return rows;
  };
  const q = (name) => pg ? `"${name}"` : `\`${name}\``;
  const textType = pg ? 'text' : 'longtext';

  await sql([
    `DROP TABLE IF EXISTS ${q('row_identity')}`,
    `CREATE TABLE ${q('row_identity')} (id INT PRIMARY KEY, ${COLUMNS.map((column) => `${q(column)} VARCHAR(40)`).join(', ')})`,
    `INSERT INTO ${q('row_identity')} VALUES (1, ${COLUMNS.map((column) => `'one ${column}'`).join(', ')}), (2, ${COLUMNS.map((column) => `'two ${column}'`).join(', ')})`,
    `DROP TABLE IF EXISTS ${q('row_identity_nopk')}`,
    `DROP TABLE IF EXISTS ${q('row_identity_dup')}`,
    `CREATE TABLE ${q('row_identity_dup')} (name VARCHAR(20), note VARCHAR(20))`,
    `INSERT INTO ${q('row_identity_dup')} VALUES ('copy', 'same'), ('copy', 'same')`,
    `CREATE TABLE ${q('row_identity_nopk')} (name VARCHAR(20), body ${textType})`,
    pg
      ? `INSERT INTO "row_identity_nopk" VALUES ('same', repeat('a', ${LONG})), ('same', repeat('b', ${LONG}))`
      : `INSERT INTO \`row_identity_nopk\` VALUES ('same', REPEAT('a', ${LONG})), ('same', REPEAT('b', ${LONG}))`,
  ]);
  const dbRows = async () => (await sql([`SELECT id, c01, c30 FROM ${q('row_identity')} ORDER BY id`]))[0]
    .map((row) => `${row.id}:${row.c01}:${row.c30}`).join(' | ');

  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1200, height: 800}})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
  }, [connection, user]);
  await page.reload();
  await sleep(1500);
  await page.getByText('Identity test', {exact: true}).first().click();
  await sleep(500);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await sleep(800);
  await page.getByText(pg ? 'public' : 'shop', {exact: true}).first().click();
  await sleep(1200);

  const grid = () => page.locator('.table-records-root:visible .cmp-records-view');
  const rows = () => grid().locator('.data-table-row');
  const headers = async () => grid().locator('.header-cell .column-name').allInnerTexts();
  /** cell by column index - hidden columns are not rendered, nth() of cells would point to other column */
  const cell = async (row, name) => rows().nth(row).locator(`.data-table-cell[data-col="${(await headers()).indexOf(name)}"]`);
  const scrollTo = async (name) => {
    const index = (await headers()).indexOf(name);
    await grid().locator('.header-cell').nth(index).scrollIntoViewIfNeeded();
    await sleep(300);
  };
  const editInline = async (row, name, value) => {
    await scrollTo(name);
    await (await cell(row, name)).dblclick();
    await sleep(200);
    await page.keyboard.press('Control+A');
    await page.keyboard.type(value);
    await page.keyboard.press('Enter');
    await sleep(200);
  };
  const save = async () => {
    await page.keyboard.press('Control+S');
    await sleep(1500);
  };
  const shownId = async (row) => {
    await scrollTo('id');
    return (await (await cell(row, 'id')).innerText()).trim();
  };
  const openTable = async (name) => {
    await page.locator('.table-list-menu-root input[placeholder="Filter tables…"]').first().fill(name);
    await page.keyboard.press('Enter');
    await sleep(1500);
  };

  // --- A: last column of wide table, second row
  await openTable('row_identity');
  const firstColumns = await rows().nth(0).locator('.data-table-cell').count();
  check('wide table: not all columns rendered', firstColumns < COLUMNS.length + 1, `${firstColumns} cells`);
  const secondId = await shownId(1);
  await editInline(1, 'c30', 'edited A');
  await save();
  let db = await dbRows();
  const rowOf = (dump, id) => dump.split(' | ').find((row) => row.startsWith(`${id}:`));
  check('A: change of last column saved to row it was made in', rowOf(db, secondId)?.endsWith(':edited A')
    && db.split(' | ').filter((row) => row.endsWith(':edited A')).length === 1, `row ${secondId}: ${db}`);

  // --- B: reload - PostgreSQL returns updated row last (no ORDER BY), the first shown row is edited
  await page.locator('.table-records-root:visible').getByRole('button', {name: 'Reload data'}).first().click();
  await sleep(1500);
  const order = `${await shownId(0)},${await shownId(1)}`;
  const firstId = await shownId(0);
  await editInline(0, 'c30', 'edited B');
  await save();
  db = await dbRows();
  check('B: after reload change is saved to the row shown', db.split(' | ').find((row) => row.startsWith(`${firstId}:`))?.endsWith(':edited B')
    && db.split(' | ').filter((row) => row.endsWith(':edited B')).length === 1, `order ${order}: ${db}`);

  // --- C: two rows and two far columns in one save, after reload (PostgreSQL: row changed by B is shown last now)
  await page.locator('.table-records-root:visible').getByRole('button', {name: 'Reload data'}).first().click();
  await sleep(1500);
  const id0 = await shownId(0);
  const id1 = await shownId(1);
  await editInline(0, 'c01', `C first ${id0}`);
  await editInline(1, 'c30', `C last ${id1}`);
  await save();
  db = await dbRows();
  const byId = Object.fromEntries(db.split(' | ').map((row) => [row.split(':')[0], row]));
  check('C: both changes saved to their rows', byId[id0]?.includes(`:C first ${id0}:`) && byId[id1]?.endsWith(`:C last ${id1}`)
    && !byId[id0]?.includes('C last') && !byId[id1]?.includes('C first'), db);

  // --- D: popup editor of cell in second shown row
  const popupId = await shownId(1);
  await scrollTo('c30');
  await (await cell(1, 'c30')).click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Edit cell…', exact: true}).click();
  await sleep(300);
  await page.locator('.cmp-value-editor textarea').fill(`D popup ${popupId}`);
  await page.getByRole('button', {name: 'Save', exact: true}).click();
  await sleep(300);
  await save();
  db = await dbRows();
  check('D: popup change saved to its row', db.split(' | ').find((row) => row.startsWith(`${popupId}:`))?.endsWith(`:D popup ${popupId}`)
    && db.split(' | ').filter((row) => row.includes('D popup')).length === 1, db);
  await page.screenshot({path: `${OUT}/row-identity-${engine}.png`});

  // --- E: no primary key, rows differ only in long text (shown as preview) - other row must never be changed
  await openTable('row_identity_nopk');
  const bodyOf = async (row) => {
    await scrollTo('body');
    return (await (await cell(row, 'body')).innerText()).trim().charAt(0);
  };
  const shownBody = await bodyOf(1);
  await editInline(1, 'name', 'changed');
  await save();
  const nopk = (await sql([`SELECT name, ${pg ? 'substr(body, 1, 1)' : 'LEFT(body, 1)'} AS b FROM ${q('row_identity_nopk')} ORDER BY b`]))[0];
  const toasts = (await page.locator('[role="status"]').allInnerTexts().catch(() => [])).join(' / ');
  check('E: no primary key, rows differ only in long text - change refused, nothing saved',
    nopk.every((row) => row.name === 'same') && /Row cannot be identified/.test(toasts),
    `edited row with body '${shownBody}...', database: ${JSON.stringify(nopk)} toast: ${toasts}`);
  check('E: refused change stays pending', await grid().locator('.data-table-cell.changed').count() === 1);
  await page.keyboard.press('Escape');

  // --- E2: exact copies (all columns compared) - any of them is the same row, one is changed
  await page.locator('.table-records-root:visible').getByRole('button', {name: 'Reload data'}).first().click().catch(() => undefined);
  await openTable('row_identity_dup');
  await editInline(1, 'note', 'one copy');
  await save();
  const dup = (await sql([`SELECT note FROM ${q('row_identity_dup')} ORDER BY note`]))[0].map((row) => row.note).join(',');
  check('E2: exact copies - one of them changed', dup === 'one copy,same', dup);

  check('no page errors', errors.length === 0, errors.join(' | '));
  await sql([`DROP TABLE IF EXISTS ${q('row_identity')}`, `DROP TABLE IF EXISTS ${q('row_identity_nopk')}`, `DROP TABLE IF EXISTS ${q('row_identity_dup')}`]);
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.log('FAIL  exception', e.message);
  process.exit(1);
});
