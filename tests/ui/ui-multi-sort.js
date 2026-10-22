// Sort by more columns: click sorts by one column, Ctrl + click adds column to ORDER BY (other arrow changes direction,
// the same arrow removes it); active arrows and order numbers in headers; rows sorted; kept after reload
// node ui-multi-sort.js <mariadb|postgres>
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const engine = process.argv[2] || 'mariadb';
const DSN = {mariadb: 'mysql://mariadb', postgres: 'postgresql://postgres:5432/shop'}[engine];
const DATABASE = engine === 'postgres' ? 'public' : 'shop';
const q = (name) => engine === 'postgres' ? `"${name}"` : `\`${name}\``;

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${engine}] ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const connection = {id: `ui-sort-${engine}`, dsn: DSN, username: 'flase', displayName: 'Sort test', changeConfirmationRequired: false};
  const user = await (await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();

  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1500, height: 900}})).newPage();
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
  await page.getByText('Sort test', {exact: true}).first().click();
  await sleep(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await sleep(1000);
  await page.locator('.vertical-slider-label', {hasText: new RegExp(`^${DATABASE}$`)}).click();
  await sleep(1200);
  await page.getByText('customers', {exact: true}).first().dispatchEvent('mousedown');
  await sleep(1800);

  const grid = page.locator('.table-records-root:visible .cmp-records-view');
  const header = (name) => grid.locator('.header-cell').filter({has: page.locator(`.column-name:text-is("${name}")`)});
  const arrow = (name, direction) => header(name).locator('.sort-box .icon-button').nth(direction === 'ASC' ? 0 : 1);
  const query = async () => (await page.locator('.table-records-root:visible .monaco-editor').first().innerText()).replace(/\s+/g, ' ').trim();
  const orderBy = async () => ((await query()).match(/ORDER BY (.*?) (LIMIT|$)/) || [])[1] || '';
  const state = async (name) => {
    const box = header(name).locator('.sort-box');
    const active = await box.locator('.icon-button.active').count() ? (await arrow(name, 'ASC').getAttribute('class')).includes('active') ? 'ASC' : 'DESC' : '';
    const position = await box.locator('.sort-position').count() ? (await box.locator('.sort-position').innerText()).trim() : '';
    return `${active}${position}`;
  };
  const click = async (name, direction, ctrl) => {
    if (ctrl) await page.keyboard.down('Control');
    await arrow(name, direction).click();
    if (ctrl) await page.keyboard.up('Control');
    await sleep(1500);
  };
  const columnValues = async (name) => {
    const index = (await grid.locator('.header-cell .column-name').allInnerTexts()).indexOf(name);
    return grid.locator('.data-table-row').evaluateAll((rows, index) => rows.map((row) => row.querySelectorAll('.data-table-cell')[index]?.innerText.trim()), index);
  };

  check('no sort at start', await grid.locator('.sort-box.sorted').count() === 0);

  // --- click: one column
  await click('city', 'ASC', false);
  check('click sorts by one column', await orderBy() === `${q('city')} ASC` && await state('city') === 'ASC', await orderBy());

  // --- Ctrl + click: other column added
  await click('last_name', 'DESC', true);
  check('Ctrl + click adds column', await orderBy() === `${q('city')} ASC, ${q('last_name')} DESC`, await orderBy());
  check('headers show direction and order', await state('city') === 'ASC1' && await state('last_name') === 'DESC2', `${await state('city')} ${await state('last_name')}`);
  const cities = await columnValues('city');
  const names = await columnValues('last_name');
  const sorted = cities.every((city, i) => i === 0 || (cities[i - 1] === 'NULL' || city === 'NULL' ? true : cities[i - 1].localeCompare(city) <= 0
    && (cities[i - 1] !== city || names[i - 1].localeCompare(names[i]) >= 0)));
  check('rows sorted by city, then last_name descending', sorted && cities.length > 10, JSON.stringify(cities.slice(0, 12).map((c, i) => `${c}/${names[i]}`)));
  await page.screenshot({path: `${OUT}/multi-sort-${engine}-01.png`, clip: {x: 200, y: 0, width: 1300, height: 300}});

  // --- Ctrl + click on other arrow of sorted column: direction changed in place
  await click('city', 'DESC', true);
  check('other arrow changes direction in place', await orderBy() === `${q('city')} DESC, ${q('last_name')} DESC` && await state('city') === 'DESC1', await orderBy());

  // --- third column, then remove the middle one
  await click('first_name', 'ASC', true);
  check('third column', await orderBy() === `${q('city')} DESC, ${q('last_name')} DESC, ${q('first_name')} ASC` && await state('first_name') === 'ASC3', await orderBy());
  await click('last_name', 'DESC', true);
  check('the same arrow removes column, order renumbered', await orderBy() === `${q('city')} DESC, ${q('first_name')} ASC` && await state('last_name') === ''
    && await state('first_name') === 'ASC2', await orderBy());

  // --- kept after reload of page
  await page.reload();
  await sleep(3000);
  check('sort and headers restored after reload', await orderBy() === `${q('city')} DESC, ${q('first_name')} ASC` && await state('city') === 'DESC1' && await state('first_name') === 'ASC2', await orderBy());

  // --- remove all with Ctrl + click, then plain click replaces
  await click('city', 'DESC', true);
  await click('first_name', 'ASC', true);
  check('last column removed - no ORDER BY', !/ORDER BY/.test(await query()) && await grid.locator('.sort-box.sorted').count() === 0, await query());
  await click('city', 'ASC', true);
  await click('id', 'DESC', false);
  check('click replaces sort by more columns', await orderBy() === `${q('id')} DESC` && await state('city') === '' && await state('id') === 'DESC', await orderBy());

  // --- ORDER BY written by hand: expression is kept, column added after it
  const editor = page.locator('.table-records-root:visible .monaco-editor').first();
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type(`SELECT * FROM ${q('customers')} ORDER BY LENGTH(${q('email')}) DESC LIMIT 100`, {delay: 2});
  await page.keyboard.press('Control+Enter');
  await sleep(1800);
  await click('city', 'ASC', true);
  check('expression of ORDER BY kept', /ORDER BY LENGTH\(.email.\) DESC, .city. ASC/.test(await query()) && await state('city') === 'ASC2', await query());

  check('no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
