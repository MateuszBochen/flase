// Filter of tables in sidebar: filter stays on top while list scrolls, arrows choose table, Enter opens it.
// node ui-table-filter.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};

(async () => {
  const connection = {id: 'ui-table-filter', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Filter test', changeConfirmationRequired: false};
  const user = await (await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();

  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1500, height: 900}})).newPage();
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
  await page.getByText('Filter test', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(1500);

  const root = page.locator('.table-list-menu-root').first();
  const list = root.locator('.table-list-content > ul');
  const input = root.locator('input[placeholder="Filter tables…"]');
  const highlighted = () => root.locator('li.highlighted').innerText().then((text) => text.trim()).catch(() => '');
  const activeTab = () => page.locator('.tab-label-list-item.active').innerText().then((text) => text.split('\n')[0].trim());

  // --- only list scrolls, filter stays on top
  const scrollable = await list.evaluate((ul) => ul.scrollHeight > ul.clientHeight);
  await list.evaluate((ul) => ul.scrollTop = ul.scrollHeight);
  await page.waitForTimeout(200);
  const inputBox = await input.boundingBox();
  const rootBox = await root.boundingBox();
  check('list of tables scrolls, filter stays visible on top', scrollable && inputBox && inputBox.y >= rootBox.y - 1 && inputBox.y < rootBox.y + 30,
    JSON.stringify({scrollable, inputBox, rootBox}));
  check('root itself does not scroll', await root.evaluate((element) => element.scrollTop === 0));
  await page.screenshot({path: `${OUT}/table-filter-01-scrolled.png`});

  // --- typed filter chooses first table, arrows move, Enter opens
  await input.click();
  await page.keyboard.type('uuid');
  await page.waitForTimeout(200);
  const names = (await root.locator('li').allInnerTexts()).map((text) => text.trim());
  check('first match chosen', await highlighted() === names[0] && names.every((name) => name.includes('uuid')), JSON.stringify(names));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  check('ArrowDown moves', await highlighted() === names[2], await highlighted());
  await page.keyboard.press('ArrowUp');
  check('ArrowUp moves', await highlighted() === names[1], await highlighted());
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  check('ArrowUp from first goes to last', await highlighted() === names[names.length - 1], await highlighted());
  await page.screenshot({path: `${OUT}/table-filter-02-chosen.png`});
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  check('Enter opens chosen table', await activeTab() === `shop/${names[names.length - 1]}`, await activeTab());
  check('focus stays in filter', await input.evaluate((element) => element === document.activeElement));

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(1500);
  // like middle click in sidebar - new tab in background
  const tabs = (await page.locator('.tab-label-list-item').allInnerTexts()).map((text) => text.split('\n')[0].trim());
  check('Ctrl+Enter opens in new tab', tabs.length === 2 && tabs.includes(`shop/${names[0]}`) && await activeTab() === `shop/${names[names.length - 1]}`, JSON.stringify(tabs));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+Enter');
  await page.waitForTimeout(1500);
  const shiftTabs = (await page.locator('.tab-label-list-item').allInnerTexts()).map((text) => text.split('\n')[0].trim());
  check('Shift+Enter opens in new tab and shows it', shiftTabs.length === 3 && await activeTab() === `shop/${names[1]}`, JSON.stringify(shiftTabs));

  // --- Escape clears filter
  await input.focus();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  check('Escape clears filter', await input.inputValue() === '' && await highlighted() === '' && (await root.locator('li').count()) > names.length);

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
