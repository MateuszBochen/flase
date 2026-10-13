// Download of binary value (BLOB, bytea): small value from preview, big one loaded whole from server.
// node ui-blob-download.js <mariadb|postgres>
const fs = require('fs');
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const API = 'http://localhost:3001';
const engine = process.argv[2] || 'mariadb';
const DSN = {mariadb: 'mysql://mariadb', postgres: 'postgresql://postgres:5432/shop'}[engine];
const DATABASE = engine === 'postgres' ? 'public' : 'shop';
/** more than preview of grid (4 KiB), less than BLOB of MySQL (64 KiB) */
const BIG_BYTES = 60000;

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${engine}] ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const execute = async (token, username, connection, statements) => {
  const ws = new WebSocket(`${API.replace('http', 'ws')}/ws/${token}`);
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  const done = new Promise((resolve) => ws.addEventListener('message', (m) => JSON.parse(m.data).message === 'EXECUTION_FINISHED' && resolve()));
  ws.send(JSON.stringify({connectionData: {user: {token, username}, connection}, command: 'EXECUTE_STATEMENTS', payload: {tabId: 'blob', database: DATABASE, statements}}));
  await done;
  ws.close();
};

(async () => {
  const connection = {id: `ui-blob-${engine}`, dsn: DSN, username: 'flase', displayName: 'Blob test', changeConfirmationRequired: false};
  const user = await (await fetch(`${API}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();
  // bytes 00 FF 7F 80 repeated - longer than preview of grid (4 KiB)
  await execute(user.token, user.username, connection, [engine === 'postgres'
    ? `INSERT INTO value_test (id, data) VALUES (100, decode(repeat('00ff7f80', ${BIG_BYTES / 4}), 'hex'))`
    : `INSERT INTO value_test (id, data) VALUES (100, REPEAT(UNHEX('00FF7F80'), ${BIG_BYTES / 4}))`]);

  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1500, height: 900}, acceptDownloads: true})).newPage();
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
  await page.getByText('Blob test', {exact: true}).first().click();
  await sleep(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await sleep(1000);
  await page.locator('.vertical-slider-label', {hasText: new RegExp(`^${DATABASE}$`)}).click();
  await sleep(1200);
  await page.getByText('value_test', {exact: true}).first().dispatchEvent('mousedown');
  await sleep(1800);

  const grid = page.locator('.table-records-root:visible .cmp-records-view');
  const rows = grid.locator('.data-table-row');
  const columnIndex = async (name) => (await grid.locator('.header-cell .column-name').allInnerTexts()).indexOf(name);
  const cell = async (row, name) => rows.nth(row).locator('.data-table-cell').nth(await columnIndex(name));
  const rowOfId = async (id) => {
    const index = await columnIndex('id');
    for (let row = 0; row < await rows.count(); row++) {
      if ((await rows.nth(row).locator('.data-table-cell').nth(index).innerText()).trim() === String(id)) return row;
    }
    return -1;
  };
  const download = async (row, via) => {
    const waiting = page.waitForEvent('download', {timeout: 10000});
    if (via === 'menu') {
      await (await cell(row, 'data')).click({button: 'right'});
      await page.getByRole('menuitem', {name: 'Download value', exact: true}).click();
    } else {
      await (await cell(row, 'data')).click({button: 'right'});
      await page.getByRole('menuitem', {name: 'Open value editor…'}).click();
      await page.getByRole('button', {name: 'Download', exact: true}).click();
    }
    const file = await waiting.catch(async (e) => {
      throw new Error(`no download, messages: ${(await page.locator('[role="status"]').allInnerTexts()).join(' | ')}`);
    });
    const path = `${OUT}/blob-${engine}-${file.suggestedFilename()}`;
    await file.saveAs(path);
    return {name: file.suggestedFilename(), bytes: fs.readFileSync(path)};
  };

  // --- small value: whole in preview
  const small = await download(await rowOfId(1), 'menu');
  check('small value downloaded', small.bytes.toString() === 'plain text in blob', JSON.stringify(small.bytes.toString()));
  check('file name of table, column and key', small.name === 'value_test-data-1.bin', small.name);

  // --- big value: loaded whole from server, not only preview
  const bigRow = await rowOfId(100);
  check('big value inserted', bigRow >= 0);
  const big = await download(bigRow, 'editor');
  const pattern = big.bytes.length === BIG_BYTES && [0, 1, 2, 3, BIG_BYTES - 1].every((index) => big.bytes[index] === [0x00, 0xff, 0x7f, 0x80][index % 4]);
  check('big value downloaded whole from value editor', pattern, `${big.bytes.length} B ${big.bytes.subarray(0, 8).toString('hex')}`);
  check('file name of big value', big.name === 'value_test-data-100.bin', big.name);
  await page.keyboard.press('Escape');

  // --- not binary column has no download
  await (await cell(await rowOfId(1), 'body')).click({button: 'right'});
  check('text value has no download', await page.getByRole('menuitem', {name: 'Download value'}).count() === 0);
  await page.keyboard.press('Escape');

  check('no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  await execute(user.token, user.username, connection, ['DELETE FROM value_test WHERE id = 100']);
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
