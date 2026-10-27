// Schema compare: differences of two databases, chosen tables in script, script opened in console of target and executed.
// node ui-schema-compare.js   (tests/run.sh creates MariaDB databases cmp_src and cmp_dst with tables before)
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 500) : ''}`);
};

const login = async (connection) => (await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();

(async () => {
  const source = {id: 'cmp-maria', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Maria', changeConfirmationRequired: false};
  // other server of the same kind
  const other = {id: 'cmp-mysql', dsn: 'mysql://mysql:3306', username: 'flase', displayName: 'MySQL', changeConfirmationRequired: false};
  const postgres = {id: 'cmp-pg', dsn: 'postgresql://postgres:5432/shop', username: 'flase', displayName: 'Postgres', changeConfirmationRequired: false};
  const users = [await login(source), await login(other), await login(postgres)];
  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1500, height: 900}, permissions: ['clipboard-read', 'clipboard-write']})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://localhost:3000');
  await page.evaluate(([connections, users]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify(connections));
    localStorage.setItem('established_connections', JSON.stringify(Object.fromEntries(connections.map((connection, index) => [connection.id, {user: users[index], connection}]))));
    localStorage.setItem('open-connections', JSON.stringify([connections[0].id]));
  }, [[source, other, postgres], users]);
  await page.reload();
  await page.waitForTimeout(1500);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(1000);

  await page.locator('.vertical-slider-label', {hasText: /^cmp_src$/}).first().click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Compare schema…'}).click();
  const tab = page.locator('.cmp-schema-compare');
  await tab.waitFor();
  const targets = await tab.getByLabel('Target connection').locator('option').allInnerTexts();
  check('targets are connections of the same kind', targets.join() === 'Maria,MySQL', JSON.stringify(targets));
  await page.waitForTimeout(500);
  await tab.getByLabel('Target database').selectOption('cmp_dst');
  await tab.getByRole('button', {name: 'Compare'}).click();
  await tab.locator('.compare-summary').waitFor({timeout: 15000});
  check('summary', /3 table\(s\) differ/.test(await tab.locator('.compare-summary').innerText()), await tab.locator('.compare-summary').innerText());
  const customers = await tab.locator('.compare-table', {hasText: 'customers'}).innerText();
  check('changes of table listed', /changed/.test(customers) && /add column city/.test(customers) && /drop column phone/.test(customers) && /email/.test(customers), customers);
  check('new table', /new\s+tags/.test(await tab.locator('.compare-table.create').innerText()));
  check('drop of table not chosen by default', !(await tab.getByLabel('Include legacy').isChecked()) && !/DROP TABLE/.test(await tab.locator('.compare-sql').innerText()));
  let sql = await tab.locator('.compare-sql').innerText();
  check('script of chosen tables', /CREATE TABLE `tags`/.test(sql) && /ALTER TABLE `cmp_dst`.`customers`/.test(sql) && /ADD COLUMN `city`/.test(sql), sql);
  await tab.getByLabel('Include legacy').check();
  sql = await tab.locator('.compare-sql').innerText();
  check('chosen drop added at the end', /DROP TABLE[^;]*`legacy`;\s*$/.test(sql), sql);
  await tab.getByLabel('Include tags').uncheck();
  check('unchosen table left out', !/CREATE TABLE `tags`/.test(await tab.locator('.compare-sql').innerText()));
  await tab.getByLabel('Include tags').check();
  await page.screenshot({path: `${OUT}/schema-compare.png`});

  // script runs in console of target
  await tab.getByRole('button', {name: 'Open in console'}).click();
  const consoleTab = page.locator('.cmp-sql-console:visible');
  await consoleTab.waitFor();
  check('console of target database', await consoleTab.locator('.console-database').inputValue() === 'cmp_dst');
  // editor is created asynchronously
  await page.waitForFunction(() => window.monaco?.editor.getEditors().some((item) => item.getContainerDomNode().closest('.cmp-sql-console') && item.getContainerDomNode().offsetParent && /ALTER TABLE/.test(item.getValue())), null, {timeout: 15000});
  await page.evaluate(() => window.monaco.editor.getEditors().find((item) => item.getContainerDomNode().closest('.cmp-sql-console') && item.getContainerDomNode().offsetParent).focus());
  await page.keyboard.press('Control+Shift+Enter');
  for (let i = 0; i < 50 && await consoleTab.getByRole('button', {name: 'Cancel'}).count(); i++) await page.waitForTimeout(100);
  await page.waitForTimeout(500);
  const logs = (await consoleTab.locator('.console-log').allInnerTexts()).map((text) => text.replace(/\s+/g, ' '));
  check('script executed', logs.length >= 3 && logs.every((log) => log.startsWith('✓')), JSON.stringify(logs));

  // compare again - the same
  await page.locator('[class*="tab-label"]').filter({hasText: 'Compare: cmp_src'}).last().click();
  await tab.getByRole('button', {name: 'Compare'}).click();
  await page.waitForTimeout(300);
  await tab.locator('.compare-summary').waitFor({timeout: 15000});
  check('after script the structure is the same', /Structure is the same \(2 table/.test(await tab.locator('.compare-summary').innerText()), await tab.locator('.compare-summary').innerText());

  // other server as target
  await tab.getByLabel('Target connection').selectOption({label: 'MySQL'});
  await page.waitForFunction(() => [...document.querySelectorAll('.cmp-schema-compare select[aria-label="Target database"] option')].some((option) => option.value === 'cmp_dst'), null, {timeout: 10000});
  await tab.getByLabel('Target database').selectOption('cmp_dst');
  await tab.getByRole('button', {name: 'Compare'}).click();
  await page.waitForTimeout(300);
  await tab.locator('.compare-summary').waitFor({timeout: 15000});
  check('database of other server compared', /2 table\(s\) differ, 0 the same/.test(await tab.locator('.compare-summary').innerText())
    && await tab.locator('.compare-table.create').count() === 2, await tab.locator('.compare-result').innerText());

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})();
