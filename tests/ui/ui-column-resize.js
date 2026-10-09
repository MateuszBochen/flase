// UI test of column resize in data grid: drag of header edge, fit to content (double click), kept after sort
// node ui-column-resize.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};
const near = (a, b, tolerance = 1.5) => Math.abs(a - b) <= tolerance;

(async () => {
  const connection = {id: 'ui-resize', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Resize test', changeConfirmationRequired: false};
  const res = await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})});
  const user = await res.json();

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
  await page.getByText('Resize test', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(1000);

  const visibleTab = () => page.locator('.table-records-root:visible');
  const grid = () => visibleTab().locator('.cmp-records-view');
  const headers = () => grid().locator('.header-columns-row .header-cell');
  const query = async () => (await visibleTab().locator('.monaco-editor').innerText()).replace(/\s+/g, ' ').trim();
  const headerIndex = async (name) => (await grid().locator('.header-cell .column-name').allInnerTexts()).indexOf(name);
  const headerWidth = async (name) => (await headers().nth(await headerIndex(name)).boundingBox()).width;
  /** widths of header and of cell of the same column in first rows */
  const cellWidths = async (name) => {
    const index = await headerIndex(name);
    return grid().locator(`.data-table-row .data-table-cell[data-col="${index}"]`).evaluateAll((cells) => cells.slice(0, 5).map((cell) => cell.getBoundingClientRect().width));
  };
  const drag = async (name, dx) => {
    const handle = headers().nth(await headerIndex(name)).locator('.column-resize-handle');
    const box = await handle.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    for (let step = 1; step <= 10; step++) {
      await page.mouse.move(box.x + box.width / 2 + dx * step / 10, box.y + box.height / 2);
    }
    await page.mouse.up();
    await page.waitForTimeout(300);
  };
  const settle = () => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

  await page.getByText('customers', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  const queryBefore = await query();

  // --- drag wider
  const emailBefore = await headerWidth('email');
  const nameBefore = await headerWidth('first_name');
  await drag('email', 150);
  await settle();
  const emailAfter = await headerWidth('email');
  check('drag makes column wider', near(emailAfter, emailBefore + 150, 2), `${emailBefore} -> ${emailAfter}`);
  check('other columns keep width', near(await headerWidth('first_name'), nameBefore), `${nameBefore} -> ${await headerWidth('first_name')}`);
  const emailCells = await cellWidths('email');
  check('cells follow header', emailCells.length > 0 && emailCells.every((width) => near(width, emailAfter)), JSON.stringify(emailCells));
  check('grid can be scrolled horizontally', await grid().locator('.cmp-data-grid').evaluate((el) => el.scrollWidth > el.clientWidth));
  check('drag does not sort / run query', await query() === queryBefore, await query());
  await page.screenshot({path: `${OUT}/resize-01-wider.png`});

  // --- narrower, minimal width
  await drag('first_name', -500);
  await settle();
  check('minimal width', near(await headerWidth('first_name'), 40), String(await headerWidth('first_name')));
  check('narrow column cells follow', (await cellWidths('first_name')).every((width) => near(width, 40)), JSON.stringify(await cellWidths('first_name')));

  // --- double click: fit to content
  await headers().nth(await headerIndex('email')).locator('.column-resize-handle').dblclick();
  await page.waitForTimeout(300);
  await settle();
  const fitted = await headerWidth('email');
  const truncated = await grid().locator(`.data-table-cell[data-col="${await headerIndex('email')}"] .dtc-content`)
    .evaluateAll((contents) => contents.filter((content) => content.scrollWidth > content.clientWidth).length);
  check('double click fits content', fitted < emailAfter && truncated === 0, `width ${fitted}, truncated ${truncated}`);
  check('fitted cells follow header', (await cellWidths('email')).every((width) => near(width, fitted)));

  // --- kept after sort (the same columns)
  await headers().nth(await headerIndex('city')).locator('.sort-box button').first().click();
  await page.waitForTimeout(1500);
  check('sort was executed', /ORDER BY/i.test(await query()), await query());
  check('widths kept after sort', near(await headerWidth('email'), fitted) && near(await headerWidth('first_name'), 40),
    `${await headerWidth('email')} / ${await headerWidth('first_name')}`);

  // --- other table starts automatic
  await page.getByText('orders', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  check('other table without sized columns', await grid().locator('.header-cell.sized').count() === 0);

  // --- remembered per table: back to customers, reload of page, query with other columns
  const openCustomers = async () => {
    await page.getByText('customers', {exact: true}).first().dispatchEvent('mousedown');
    await page.waitForTimeout(1500);
  };
  await openCustomers();
  check('widths restored when table is opened again', near(await headerWidth('email'), fitted) && near(await headerWidth('first_name'), 40),
    `${await headerWidth('email')} / ${await headerWidth('first_name')}`);
  check('restored widths used by cells', (await cellWidths('email')).every((width) => near(width, fitted)));

  await page.reload();
  await page.waitForTimeout(1500);
  await page.getByText('Resize test', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(1000);
  await openCustomers();
  check('widths restored after reload of page', near(await headerWidth('email'), fitted) && near(await headerWidth('first_name'), 40),
    `${await headerWidth('email')} / ${await headerWidth('first_name')}`);

  // editor is created asynchronously after reload - type only when it shows the query, run only when text is there
  await page.waitForFunction(() => [...document.querySelectorAll('.table-records-root')].some((root) => root.offsetParent
    && /SELECT/.test(root.querySelector('.monaco-editor .view-lines')?.textContent || '')), null, {timeout: 10000});
  for (let attempt = 0; attempt < 3 && !(await query()).startsWith('SELECT city, email'); attempt++) {
    await visibleTab().locator('.monaco-editor').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('SELECT city, email FROM customers', {delay: 2});
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
  }
  // completion of "customers" stays open (uuid_customers matches too) - Enter would accept it instead of running query
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.suggest-widget.visible'), null, {timeout: 3000}).catch(() => {});
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1500);
  check('query with other columns: widths by column name', (await grid().locator('.header-cell .column-name').allInnerTexts()).join(',') === 'city,email'
    && near(await headerWidth('email'), fitted), `${(await grid().locator('.header-cell .column-name').allInnerTexts()).join(',')} ${await headerWidth('email')}`);

  // --- reset from context menu: automatic again and forgotten
  await openCustomers();
  await grid().locator('.data-table-row').first().locator('.data-table-cell').first().click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Reset column widths', exact: true}).click();
  await page.waitForTimeout(300);
  check('reset column widths', await grid().locator('.header-cell.sized').count() === 0 && near(await headerWidth('first_name'), nameBefore), String(await headerWidth('first_name')));
  await page.getByText('orders', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  await openCustomers();
  check('reset widths are forgotten', await grid().locator('.header-cell.sized').count() === 0);
  await grid().locator('.data-table-row').first().locator('.data-table-cell').first().click({button: 'right'});
  check('no reset item without sized columns', await page.getByRole('menuitem', {name: 'Reset column widths', exact: true}).count() === 0);
  await page.keyboard.press('Escape');

  // --- many columns: resize after horizontal scroll (only visible columns are rendered)
  await page.getByText('wide_test', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(2000);
  await grid().locator('.cmp-data-grid').evaluate((el) => { el.scrollLeft = el.scrollWidth; });
  await page.waitForTimeout(300);
  const c45Before = await headerWidth('c45');
  await drag('c45', 120);
  await settle();
  await page.waitForTimeout(200);
  const c45After = await headerWidth('c45');
  const c45Cells = await cellWidths('c45');
  check('resize of scrolled column', near(c45After, c45Before + 120, 2) && c45Cells.length > 0 && c45Cells.every((width) => near(width, c45After)),
    `${c45Before} -> ${c45After}, cells ${JSON.stringify(c45Cells)}`);
  await page.screenshot({path: `${OUT}/resize-02-wide.png`});

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
