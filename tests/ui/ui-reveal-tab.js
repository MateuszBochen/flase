// Always select opened table: switching tab opens connection and database of the tab in sidebar and scrolls to its table.
// node ui-reveal-tab.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};

(async () => {
  const connection = {id: 'ui-reveal', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Reveal test', changeConfirmationRequired: false};
  const user = await (await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();

  const browser = await chromium.launch();
  // low window - list of tables of shop scrolls
  const page = await (await browser.newContext({viewport: {width: 1300, height: 700}})).newPage();
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

  const sliderItem = (name) => page.locator('li.vertical-slider-item', {has: page.locator(':scope > .vertical-slider-label', {hasText: new RegExp(`^${name}$`)})}).first();
  const connectionItem = sliderItem('Reveal test');
  const databaseItem = sliderItem;
  /** opens / closes item by its label - click in middle of open item would hit its content */
  const clickItem = (item) => item.locator(':scope > .vertical-slider-label').click();
  const isOpen = (item) => item.evaluate((li) => li.classList.contains('active')).catch(() => false);
  const isOn = () => page.locator('button.reveal-active-tab').evaluate((button) => button.classList.contains('active'));
  const toggle = page.locator('button.reveal-active-tab');
  const tabs = page.locator('.tab-label-list-item');
  const activeTable = () => page.locator('.table-list-menu-root li.active-in-tab');
  /** table of current tab is inside visible part of list of tables */
  const tableVisible = async () => activeTable().evaluate((li) => {
    const list = li.closest('ul').getBoundingClientRect();
    const box = li.getBoundingClientRect();
    return box.top >= list.top - 1 && box.bottom <= list.bottom + 1 && box.height > 0;
  }).catch(() => false);

  await connectionItem.click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(1200);

  check('off by default', await toggle.count() === 1 && !(await isOn()), await toggle.getAttribute('class'));

  // tabs: first table of shop (current), last table of shop and a table of blog (background)
  const input = page.locator('.table-list-menu-root input[placeholder="Filter tables…"]').first();
  const names = (await page.locator('.table-list-menu-root li').allInnerTexts()).map((text) => text.trim());
  const first = names[0];
  const last = names[names.length - 1];
  await input.fill(first);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  await input.fill(last);
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(500);
  await input.fill('');
  await clickItem(databaseItem('blog'));
  await page.waitForTimeout(1000);
  const blogTable = (await page.locator('.table-list-menu-root li').first().innerText()).trim();
  await page.locator('.table-list-menu-root input[placeholder="Filter tables…"]').first().fill(blogTable);
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(500);

  // turned off - switch of tab does not change sidebar
  await tabs.filter({hasText: `shop/${last}`}).first().click();
  await page.waitForTimeout(500);
  check('off: database of tab stays closed', await isOpen(databaseItem('blog')) && !(await isOpen(databaseItem('shop'))));

  // turning on shows current tab at once
  await toggle.dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  check('turned on: button marked', await isOn());
  check('turned on: database of current tab opened', await isOpen(databaseItem('shop')) && !(await isOpen(databaseItem('blog'))));
  check('turned on: list scrolled to table of tab', (await activeTable().innerText()).trim() === last && await tableVisible(),
    `${last} visible=${await tableVisible()}`);
  await page.screenshot({path: `${OUT}/reveal-01-on.png`});

  // switch to table of other database
  await tabs.filter({hasText: `blog/${blogTable}`}).first().click();
  await page.waitForTimeout(1000);
  check('switch: other database opened', await isOpen(databaseItem('blog')), blogTable);
  check('switch: its table marked and visible', (await activeTable().innerText()).trim() === blogTable && await tableVisible());

  // first table of shop - list scrolls back up
  await tabs.filter({hasText: `shop/${first}`}).first().click();
  await page.waitForTimeout(1000);
  check('switch back: shop opened, first table visible', await isOpen(databaseItem('shop')) && (await activeTable().innerText()).trim() === first && await tableVisible());

  // closed connection is opened again
  await clickItem(connectionItem);
  await page.waitForTimeout(500);
  const closedConnection = !(await isOpen(connectionItem));
  await tabs.filter({hasText: `shop/${last}`}).first().click();
  await page.waitForTimeout(1200);
  check('closed connection opened by switch of tab', closedConnection && await isOpen(connectionItem) && await isOpen(databaseItem('shop'))
    && (await activeTable().innerText()).trim() === last && await tableVisible(), `closed=${closedConnection}`);

  // remembered after reload
  await page.reload();
  await page.waitForTimeout(2000);
  check('setting remembered after reload', await isOn());

  // turned off again - switch does not open database
  await page.locator('button.reveal-active-tab').dispatchEvent('mousedown');
  await page.waitForTimeout(300);
  await clickItem(databaseItem('blog'));
  await page.waitForTimeout(800);
  await tabs.filter({hasText: `shop/${first}`}).first().click();
  await page.waitForTimeout(800);
  check('turned off: switch keeps sidebar', await isOpen(databaseItem('blog')) && !(await isOpen(databaseItem('shop'))));

  check('no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
