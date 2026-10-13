// Sidebar uses the whole height: open lists grow to the bottom of window, shrink and scroll when space is shared.
// node ui-sidebar-height.js
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
  const maria = {id: 'h-maria', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Height Maria', changeConfirmationRequired: false};
  const mysql = {id: 'h-mysql', dsn: 'mysql://mysql:3306', username: 'flase', displayName: 'Height MySQL', changeConfirmationRequired: false};
  const users = {[maria.id]: await login(maria), [mysql.id]: await login(mysql)};

  const browser = await chromium.launch();
  const context = await browser.newContext({viewport: {width: 1400, height: 700}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://localhost:3000');
  await page.evaluate(([connections, users]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify(connections));
    localStorage.setItem('established_connections', JSON.stringify(Object.fromEntries(connections.map((c) => [c.id, {user: users[c.id], connection: c}]))));
    // Maria open with database shop, MySQL closed
    localStorage.setItem('open-connections', JSON.stringify([connections[0].id]));
    localStorage.setItem(`open-database:${connections[0].id}`, JSON.stringify(['shop']));
    localStorage.setItem(`open-database:${connections[1].id}`, JSON.stringify(['shop']));
  }, [[maria, mysql], users]);
  await page.reload();
  await page.waitForTimeout(1500);
  /** database list of connection, database shop open (remembered as open) */
  const openShop = async (index) => {
    await page.locator('button[title="Load database list"]').nth(index).dispatchEvent('mousedown');
    await page.waitForTimeout(1200);
    if (await page.locator('.table-list-content').count() <= index) {
      await page.locator('.vertical-slider-label', {hasText: /^shop$/}).nth(index).click();
      await page.waitForTimeout(1200);
    }
  };
  await openShop(0);

  const column = page.locator('.resizable-column').first();
  const geometry = () => page.evaluate(() => {
    const column = document.querySelector('.resizable-column').getBoundingClientRect();
    const lists = [...document.querySelectorAll('.table-list-content > ul')].map((ul) => {
      const box = ul.getBoundingClientRect();
      return {top: Math.round(box.top), bottom: Math.round(box.bottom), height: Math.round(box.height), scrolls: ul.scrollHeight > ul.clientHeight + 1, rows: ul.children.length};
    });
    const rootElement = document.querySelector('.resizable-column > .vertical-slider-root');
    const root = rootElement.getBoundingClientRect();
    const fill = {client: rootElement.clientHeight, content: rootElement.firstElementChild.offsetHeight + 6, scrolls: rootElement.scrollHeight > rootElement.clientHeight + 1};
    return {columnBottom: Math.round(column.bottom), rootBottom: Math.round(root.bottom), columnScrolls: document.querySelector('.resizable-column').scrollHeight > document.querySelector('.resizable-column').clientHeight + 1, fill, lists};
  });

  // --- 1. one list, more tables than space: it reaches bottom of window and scrolls, column itself does not
  let g = await geometry();
  check('sidebar is filled to the bottom', g.fill.content >= g.fill.client - 12 && g.fill.content <= g.fill.client, JSON.stringify(g.fill));
  check('table list scrolls, sidebar does not', g.lists[0]?.scrolls && !g.columnScrolls && !g.fill.scrolls, JSON.stringify(g));
  await page.screenshot({path: `${OUT}/sidebar-height-01-one.png`});

  // --- 2. taller window: list grows with it (no fixed height)
  const before = g.lists[0].height;
  await page.setViewportSize({width: 1400, height: 800});
  await page.waitForTimeout(400);
  g = await geometry();
  // grows to the bottom of window, or to all its tables when they fit
  check('list grows with window', g.lists[0].height > before + 50 && (g.fill.content >= g.fill.client - 12 || !g.lists[0].scrolls), `${before} -> ${g.lists[0].height} ${JSON.stringify(g.fill)}`);

  // --- 3. very tall window: list has only height of its tables
  await page.setViewportSize({width: 1400, height: 2000});
  await page.waitForTimeout(400);
  g = await geometry();
  check('all tables fit: natural height, no scroll', !g.lists[0].scrolls && g.fill.content < g.fill.client - 500, JSON.stringify(g));
  await page.setViewportSize({width: 1400, height: 700});
  await page.waitForTimeout(400);

  // --- 4. second connection opened: both lists visible, space is shared, nothing outside of column
  await page.getByText('Height MySQL', {exact: true}).first().click();
  await page.waitForTimeout(800);
  await openShop(1);
  g = await geometry();
  check('small window: both lists keep 5 rows, sidebar scrolls', g.lists.length === 2 && g.lists.every((list) => list.height >= 5 * 21 && list.scrolls) && g.fill.scrolls && !g.columnScrolls, JSON.stringify(g));
  await page.screenshot({path: `${OUT}/sidebar-height-02-two-small.png`});

  await page.setViewportSize({width: 1400, height: 1100});
  await page.waitForTimeout(500);
  g = await geometry();
  check('bigger window: space shared, sidebar filled, no scroll of sidebar', g.lists.every((list) => list.height > 5 * 22) && !g.fill.scrolls && g.fill.content >= g.fill.client - 12, JSON.stringify(g));
  check('bigger window: lists get equal share', Math.abs(g.lists[0].height - g.lists[1].height) <= 2, JSON.stringify(g));
  await page.screenshot({path: `${OUT}/sidebar-height-03-two.png`});

  // filter shrinks one list - the other one gets its space
  const other = g.lists[1].height;
  await page.locator('input[placeholder="Filter tables…"]').first().fill('cat');
  await page.waitForTimeout(500);
  g = await geometry();
  check('filtered list is short, other list grows', g.lists[0].rows < 3 && g.lists[0].height < 60 && g.lists[1].height > other, `${other} ${JSON.stringify(g)}`);

  check('no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
