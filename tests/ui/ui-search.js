// UI test of row editing. node ui-test.js <confirmRequired 0|1>
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const confirmRequired = process.argv[2] === '1';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};

(async () => {
  const connection = {id: 'ui-test', dsn: 'mysql://mariadb', username: 'flase', displayName: 'UI test', changeConfirmationRequired: confirmRequired};
  const res = await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})});
  const user = await res.json();

  const browser = await chromium.launch();
  const context = await browser.newContext({viewport: {width: 1500, height: 900}, permissions: ['clipboard-read', 'clipboard-write']});
  const page = await context.newPage();
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

  await page.getByText('UI test', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(1000);
  await page.screenshot({path: `${OUT}/01-menu.png`});
  await page.getByText('orders', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  await page.screenshot({path: `${OUT}/02-table.png`});

  const menu = async (target, label) => {
    await target.click({button: 'right'});
    await page.getByRole('menuitem', {name: label, exact: true}).click();
    await page.waitForTimeout(200);
  };
  const blankArea = () => page.locator('.cmp-records-view').last().locator('.data-table-content');
  const rightClickBlank = async (label) => {
    const box = await blankArea().boundingBox();
    await page.mouse.click(box.x + 200, box.y + box.height - 40, {button: 'right'});
    await page.getByRole('menuitem', {name: label, exact: true}).click();
    await page.waitForTimeout(200);
  };
  const visibleTab = () => page.locator('.table-records-root:visible');
  const grid = () => visibleTab().locator('.cmp-records-view');
  const rows = () => grid().locator('.data-table-row');
  const query = async () => (await visibleTab().locator('.monaco-editor').innerText()).replace(/\s+/g, ' ').trim();
  const tabLabels = async () => (await page.locator('[class*="tab-label-list-item"], [class*="tab-label"] li, [class*="tab-label"] > *').allInnerTexts());
  const columnIndex = async (name) => (await grid().locator('.header-cell .column-name').allInnerTexts()).indexOf(name);
  const cell = async (row, name) => rows().nth(row).locator('.data-table-cell').nth(await columnIndex(name));

  // tree filter
  const sidebarFilter = page.locator('.table-list-filter input');
  await sidebarFilter.fill('ord');
  await page.waitForTimeout(300);
  const filtered = await page.locator('.table-list-menu-root li').allInnerTexts();
  check('table tree filter', filtered.length === 2 && filtered.every((t) => t.includes('ord')), JSON.stringify(filtered));
  await sidebarFilter.fill('');

  await page.locator('.table-list-filter button[title^="Search in data of shop"]').dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  const search = page.locator('.cmp-database-search:visible');
  check('search tab opened', await search.count() === 1 && (await page.locator('body').innerText()).includes('Search: shop'));
  await search.locator('.search-term').fill('Krakow');
  await search.locator('.search-term').press('Enter');
  await page.waitForTimeout(2500);
  await page.screenshot({path: `${OUT}/88-search.png`});
  const summary = await search.locator('.search-summary').innerText();
  const tables = await search.locator('.search-link').allInnerTexts();
  check('search results', tables.includes('customers') && tables.includes('value_test') && /row\(s\) in \d+ of \d+ table/.test(summary), `${tables} | ${summary}`);

  // open whole table result in new tab
  await search.locator('.search-link', {hasText: 'customers'}).click({modifiers: ['Control']});
  await page.waitForTimeout(1500);
  check('result opened in new tab, search tab kept', (await page.locator('body').innerText()).includes('Search: shop') && (await page.locator('body').innerText()).includes('shop/customers'));
  await page.locator('[class*="tab-label"]').filter({hasText: 'shop/customers'}).last().click();
  await page.waitForTimeout(800);
  const footer = (await visibleTab().locator('.pager-info').innerText()).replace(/\s+/g, ' ');
  const expected = (await (async () => {
    await page.locator('[class*="tab-label"]').filter({hasText: 'Search: shop'}).last().click();
    await page.waitForTimeout(300);
    return (await search.locator('tr', {hasText: 'customers'}).locator('td.rows').innerText()).trim();
  })());
  check('opened rows match search count', footer.includes(`/ ${expected}`), `${footer} vs ${expected}`);

  // column chip, exact mode, nothing found
  await search.locator('tr', {hasText: 'value_test'}).locator('.search-column').first().click({modifiers: ['Control']});
  await page.waitForTimeout(1200);
  await page.locator('[class*="tab-label"]').filter({hasText: 'shop/value_test'}).last().click();
  await page.waitForTimeout(500);
  const q = (await visibleTab().locator('.monaco-editor').innerText()).replace(/\s+/g, ' ');
  check('column result query', q.includes("WHERE `doc` LIKE '%Krakow%'"), q);
  await page.locator('[class*="tab-label"]').filter({hasText: 'Search: shop'}).last().click();
  await search.locator('select').selectOption('exact');
  await search.locator('.search-term').fill('user1@example.com');
  await search.locator('.search-term').press('Enter');
  await page.waitForTimeout(2000);
  check('exact search', JSON.stringify(await search.locator('.search-link').allInnerTexts()) === '["customers"]');
  await search.locator('.search-term').fill('no such value 123');
  await search.locator('.search-term').press('Enter');
  await page.waitForTimeout(2000);
  check('nothing found', await search.locator('.search-empty').count() === 1);

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
