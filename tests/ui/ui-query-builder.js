// UI of query builder (tables, joins from foreign keys and drawn by mouse, grid, SQL, run, view, restore)
// and of foreign keys (ER diagram relation mode, structure form). node ui-query-builder.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const BASE = 'http://localhost:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};

(async () => {
  const connection = {id: 'ui-qb', dsn: 'mysql://mariadb', username: 'flase', displayName: 'UI qb', changeConfirmationRequired: false};
  const user = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();
  const browser = await chromium.launch();
  const context = await browser.newContext({viewport: {width: 1600, height: 950}, permissions: ['clipboard-read', 'clipboard-write']});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
  }, [connection, user]);

  const sql = (statements, database = 'shop') => page.evaluate(([token, connection, user, statements, database]) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:3001/ws/${token}`);
    let error = null;
    ws.onopen = () => ws.send(JSON.stringify({connectionData: {user, connection}, command: 'EXECUTE_STATEMENTS', payload: {tabId: 'setup', database, statements, stopOnError: false}}));
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.message === 'STATEMENT_FINISHED' && message.payload.error) error = message.payload.error;
      if (message.message === 'EXECUTION_FINISHED' || message.message === 'QUERY_ERROR') {
        ws.close();
        resolve(error);
      }
    };
  }), [user.token, connection, user, statements, database]);

  await sql(['DROP VIEW IF EXISTS v_city_orders', 'DROP TABLE IF EXISTS qb_a', 'DROP TABLE IF EXISTS qb_b', 'CREATE TABLE qb_b (id INT PRIMARY KEY)', 'CREATE TABLE qb_a (id INT PRIMARY KEY, b_id INT)']);
  await page.reload();
  await page.waitForTimeout(1500);

  const popup = () => page.locator('.popup-root.open').last();
  const activeTab = () => page.locator('.tab-label-list-item.active').innerText().then((text) => text.split('\n')[0].trim());
  const openTab = async (label) => {
    await page.locator('.tab-label-list-item').filter({hasText: label}).first().click();
    await page.waitForTimeout(400);
  };
  /** right click on point in the middle of svg line */
  const rightClickPath = async (locator) => {
    const point = await locator.evaluate((path) => {
      const middle = path.getPointAtLength(path.getTotalLength() / 2);
      const matrix = path.getScreenCTM();
      return {x: middle.x * matrix.a + middle.y * matrix.c + matrix.e, y: middle.x * matrix.b + middle.y * matrix.d + matrix.f};
    });
    await page.mouse.click(point.x, point.y, {button: 'right'});
  };
  const hold = async (button) => {
    const box = await button.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1800);
    await page.mouse.up();
  };

  await page.getByText('UI qb', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.locator('.vertical-slider-label', {hasText: /^shop$/}).click();
  await page.waitForTimeout(1000);

  // --- query builder
  await page.locator('button[title="Query builder for shop"]').dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  check('query builder opened', await activeTab() === 'Query builder: shop', await activeTab());
  const qb = page.locator('.cmp-query-builder:visible');
  const sqlText = async () => (await qb.locator('.qb-sql').innerText()).replace(/ /g, ' ').trim();
  await qb.locator('.qb-tables button', {hasText: /^\s*customers$/}).click();
  await qb.locator('.qb-tables button', {hasText: /^\s*orders$/}).click();
  await page.waitForTimeout(300);
  check('join from foreign key', (await sqlText()).includes('INNER JOIN `orders` ON `customers`.`id` = `orders`.`customer_id`'), await sqlText());

  await qb.getByLabel('customers.city').check();
  await qb.getByLabel('orders.id').check();
  await qb.getByLabel('Alias 2').fill('orders');
  await qb.getByLabel('Aggregate 2').selectOption('COUNT');
  await qb.getByLabel('Sort 2').selectOption('DESC');
  await qb.getByLabel('Filter 1').selectOption('IS NOT NULL');
  await qb.getByLabel('Limit').fill('5');
  await page.waitForTimeout(300);
  const expected = 'SELECT `customers`.`city`,\n  COUNT(`orders`.`id`) AS `orders`\nFROM `customers`\nINNER JOIN `orders` ON `customers`.`id` = `orders`.`customer_id`\n'
    + 'WHERE `customers`.`city` IS NOT NULL\nGROUP BY `customers`.`city`\nORDER BY COUNT(`orders`.`id`) DESC\nLIMIT 5;';
  check('SQL of grid', await sqlText() === expected, await sqlText());
  await page.screenshot({path: `${OUT}/qb-01-builder.png`});

  // join kind from menu of line
  await rightClickPath(qb.locator('.qb-join-hit').first());
  await page.waitForTimeout(200);
  await page.getByRole('menuitem', {name: 'LEFT JOIN'}).click();
  await page.waitForTimeout(200);
  check('join kind changed', (await sqlText()).includes('LEFT JOIN `orders`'), await sqlText());

  // table without relation, own join drawn by mouse, removal of table
  await qb.locator('.qb-tables button', {hasText: /^\s*products$/}).click();
  await page.waitForTimeout(300);
  check('table without relation is CROSS JOIN', (await sqlText()).includes('CROSS JOIN `products`'), await sqlText());
  const handle = qb.locator('[data-column="orders.id"] .qb-handle');
  const target = qb.locator('[data-column="products.id"]');
  const from = await handle.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + 3, from.y + 5);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, {steps: 5});
  await page.mouse.move(to.x + 30, to.y + 8, {steps: 5});
  await page.mouse.up();
  await page.waitForTimeout(300);
  check('join drawn by mouse', (await sqlText()).includes('INNER JOIN `products` ON `orders`.`id` = `products`.`id`'), await sqlText());
  await qb.getByRole('button', {name: 'Remove products'}).click();
  await page.waitForTimeout(200);
  check('table removed with its join', !(await sqlText()).includes('products'));

  // run in console
  await qb.getByRole('button', {name: 'Run'}).click();
  await page.waitForTimeout(2500);
  check('console with query opened', await activeTab() === 'Console: query builder', await activeTab());
  const consoleTabs = await page.locator('.cmp-sql-console:visible .console-result-tabs').innerText();
  check('query executed', /Result 1/.test(consoleTabs) && !/⚠/.test(consoleTabs), consoleTabs);
  check('result rows', await page.locator('.cmp-sql-console:visible .data-table-row').count() === 5);

  // create view
  await openTab('Query builder: shop');
  await qb.getByRole('button', {name: 'Create view…'}).click();
  await popup().getByLabel('View name').fill('v_city_orders');
  await popup().getByRole('button', {name: 'Preview SQL'}).click();
  await page.waitForTimeout(600);
  check('view preview', (await popup().locator('.cmp-sql-preview').innerText()).startsWith('CREATE VIEW `shop`.`v_city_orders` AS\nSELECT `customers`.`city`'), await popup().locator('.cmp-sql-preview').innerText());
  await popup().getByRole('button', {name: 'Execute'}).click();
  await page.waitForTimeout(1200);
  check('view created', await sql(['SELECT * FROM v_city_orders']) === null);

  // state restored after reload
  const before = await sqlText();
  await page.reload();
  await page.waitForTimeout(3000);
  await openTab('Query builder: shop');
  await page.waitForTimeout(800);
  check('builder restored after reload', await sqlText() === before && await qb.locator('.qb-box').count() === 2, await sqlText());

  // --- ER diagram: relation mode
  await page.locator('button[title="ER diagram of shop"]').dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  const er = page.locator('.cmp-er-diagram:visible');
  await er.getByPlaceholder('Filter (with related tables)').fill('qb_');
  await page.waitForTimeout(500);
  await er.getByRole('button', {name: 'Add relation'}).click();
  await er.locator('[data-column="qb_a.b_id"]').click();
  check('relation source selected', /qb_a\.b_id → click referenced column/.test(await er.locator('.er-hint').innerText()));
  await er.locator('[data-column="qb_b.id"]').click();
  await page.waitForTimeout(600);
  check('foreign key form prefilled', /Add foreign key to qb_a/.test(await popup().locator('.popup-name').innerText())
    && await popup().getByLabel('Referenced table').inputValue() === 'qb_b' && await popup().getByLabel('Referenced column 1').inputValue() === 'id'
    && await popup().getByLabel('Column 1', {exact: true}).inputValue() === 'b_id');
  await popup().getByLabel('ON DELETE').selectOption('CASCADE');
  await popup().getByRole('button', {name: 'Preview SQL'}).click();
  await page.waitForTimeout(600);
  const fkSql = await popup().locator('.cmp-sql-preview').innerText();
  check('foreign key preview', fkSql === 'ALTER TABLE `shop`.`qb_a`\n  ADD FOREIGN KEY (`b_id`) REFERENCES `shop`.`qb_b` (`id`) ON DELETE CASCADE ON UPDATE RESTRICT;', fkSql);
  await popup().getByRole('button', {name: 'Execute'}).click();
  await page.waitForTimeout(2000);
  check('relation drawn', await er.locator('[data-relation="qb_a.b_id"]').count() === 1);
  await page.screenshot({path: `${OUT}/qb-02-er-relation.png`});
  await er.getByRole('button', {name: 'Cancel relation'}).click();
  await rightClickPath(er.locator('[data-relation="qb_a.b_id"]'));
  await page.waitForTimeout(300);
  const dropItem = page.getByRole('menuitem', {name: /^Drop foreign key qb_a_ibfk_1/});
  check('drop item with constraint name', await dropItem.count() === 1);
  await dropItem.click();
  await page.waitForTimeout(700);
  check('drop preview', (await popup().locator('.cmp-sql-preview').innerText()) === 'ALTER TABLE `shop`.`qb_a`\n  DROP FOREIGN KEY `qb_a_ibfk_1`;');
  await hold(popup().getByRole('button', {name: 'Hold to execute'}));
  await page.waitForTimeout(2000);
  check('relation removed', await er.locator('[data-relation="qb_a.b_id"]').count() === 0);

  // --- structure: foreign key form and drop from context menu
  await page.locator('.table-list-menu-root li', {hasText: /^qb_a$/}).locator('button').dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  await page.locator('.table-records-root:visible').getByRole('button', {name: 'Structure', exact: true}).click();
  await page.waitForTimeout(1200);
  const structure = page.locator('.cmp-structure-view:visible');
  await structure.getByRole('button', {name: '+ Add foreign key'}).click();
  await page.waitForTimeout(400);
  await popup().getByLabel('Referenced table').selectOption('qb_b');
  await popup().getByLabel('Column 1', {exact: true}).selectOption('b_id');
  await popup().getByLabel('Constraint name').fill('fk_qb');
  await popup().getByRole('button', {name: 'Preview SQL'}).click();
  await page.waitForTimeout(600);
  check('structure foreign key preview', (await popup().locator('.cmp-sql-preview').innerText()).includes('ADD CONSTRAINT `fk_qb` FOREIGN KEY (`b_id`) REFERENCES `shop`.`qb_b` (`id`)'));
  await popup().getByRole('button', {name: 'Execute'}).click();
  await page.waitForTimeout(1500);
  const keyRow = structure.locator('.structure-section', {hasText: 'Foreign keys'}).locator('tbody tr', {hasText: 'fk_qb'});
  check('foreign key in structure', await keyRow.count() === 1);
  await keyRow.click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Drop foreign key'}).click();
  await page.waitForTimeout(600);
  await hold(popup().getByRole('button', {name: 'Hold to execute'}));
  await page.waitForTimeout(1500);
  check('foreign key dropped', await keyRow.count() === 0);

  await sql(['DROP VIEW IF EXISTS v_city_orders', 'DROP TABLE IF EXISTS qb_a', 'DROP TABLE IF EXISTS qb_b']);
  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
