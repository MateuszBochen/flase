// UI of databases: create / rename / drop database, overview with operations on selected tables, create table,
// table options, routines (new, execute, edit, drop), view from console query, sidebar menus. node ui-database.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const BASE = 'http://localhost:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 300) : ''}`);
};
const DB = 'ui_db_test';
const DB2 = 'ui_db_test2';

(async () => {
  const connection = {id: 'ui-db', dsn: 'mysql://mariadb', username: 'root', displayName: 'UI root', changeConfirmationRequired: false};
  const user = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'root', password: 'root'}, connectionData: connection})})).json();

  const browser = await chromium.launch();
  const context = await browser.newContext({viewport: {width: 1500, height: 900}, permissions: ['clipboard-read', 'clipboard-write']});
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

  /** statements through own websocket of page - setup and checks */
  const sql = (statements, database = null) => page.evaluate(([token, connection, user, statements, database]) => new Promise((resolve) => {
    const ws = new WebSocket(`ws://localhost:3001/ws/${token}`);
    const rows = [];
    let error = null;
    ws.onopen = () => ws.send(JSON.stringify({connectionData: {user, connection}, command: 'EXECUTE_STATEMENTS', payload: {tabId: 'setup', database, statements, stopOnError: false}}));
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.message === 'SINGLE_SELECT_RECORD') rows.push(message.payload.rowDataValue);
      if (message.message === 'STATEMENT_FINISHED' && message.payload.error) error = message.payload.error;
      if (message.message === 'EXECUTION_FINISHED' || message.message === 'QUERY_ERROR') {
        ws.close();
        resolve({rows, error});
      }
    };
  }), [user.token, connection, user, statements, database]);

  await sql([`DROP DATABASE IF EXISTS ${DB}`, `DROP DATABASE IF EXISTS ${DB2}`]);
  await page.reload();
  await page.waitForTimeout(1500);

  const popup = () => page.locator('.popup-root.open').last();
  const popupTitle = () => popup().locator('.popup-name').innerText();
  const hold = async (button) => {
    const box = await button.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1800);
    await page.mouse.up();
  };
  const menu = async (target, label) => {
    await target.click({button: 'right'});
    await page.waitForTimeout(150);
    await page.getByRole('menuitem', {name: label, exact: true}).click();
    await page.waitForTimeout(300);
  };
  const tabLabels = () => page.locator('.tab-label-list-item').allInnerTexts().then((texts) => texts.map((text) => text.split('\n')[0].trim()));
  const activeTab = () => page.locator('.tab-label-list-item.active').innerText().then((text) => text.split('\n')[0].trim());
  const openTab = async (label) => {
    await page.locator('.tab-label-list-item').filter({hasText: label}).first().click();
    await page.waitForTimeout(400);
  };
  const sidebarDatabase = (name) => page.locator('.vertical-slider-label', {hasText: new RegExp(`^${name}$`)});

  await page.getByText('UI root', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);

  // --- create database
  await page.locator('button[title="Create database"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(500);
  check('create database form', await popupTitle() === 'Create database', await popupTitle());
  await popup().getByLabel('Name').fill(DB);
  await popup().getByLabel('Collation').selectOption('utf8mb4_bin');
  await popup().getByRole('button', {name: 'Preview SQL'}).click();
  await page.waitForTimeout(600);
  check('create database preview', (await popup().locator('.cmp-sql-preview').innerText()) === `CREATE DATABASE \`${DB}\` COLLATE utf8mb4_bin;`, await popup().locator('.cmp-sql-preview').innerText());
  await page.screenshot({path: `${OUT}/db-01-create-preview.png`});
  await popup().getByRole('button', {name: 'Execute'}).click();
  await page.waitForTimeout(1500);
  check('overview of new database opened', await activeTab() === `${DB}: overview`, await activeTab());
  check('new database in sidebar', await sidebarDatabase(DB).count() === 1);
  const overview = page.locator('.cmp-database-overview:visible');
  check('overview shows collation, no tables', /utf8mb4_bin/.test(await overview.locator('.overview-chip').innerText()) && /No tables/.test(await overview.innerText()));

  // --- create table
  await overview.getByRole('button', {name: 'New table'}).first().click();
  await page.waitForTimeout(800);
  check('create table tab', await activeTab() === `${DB}: new table`, await activeTab());
  const form = page.locator('.cmp-create-table:visible');
  await form.getByLabel('Table name').fill('items');
  await form.getByLabel('Column 2 name').fill('title');
  await form.getByLabel('Column 2 type').fill('varchar(100)');
  await form.getByRole('button', {name: 'Add column'}).click();
  await form.getByLabel('Column 3 name').fill('price');
  await form.getByLabel('Column 3 type').fill('decimal(10,2)');
  await form.getByLabel('Column 3 nullable').uncheck();
  await form.getByLabel('Column 3 default').selectOption('value');
  await form.getByLabel('Column 3 default value').fill('0');
  await form.getByLabel('Table comment').fill('Shop items');
  await form.getByRole('button', {name: 'Add index'}).click();
  await form.getByLabel('Index kind').selectOption('UNIQUE');
  await form.locator('.create-table-index-columns label', {hasText: 'title'}).click();
  await page.screenshot({path: `${OUT}/db-02-create-table.png`});
  await form.getByRole('button', {name: 'Preview SQL & create'}).click();
  await page.waitForTimeout(700);
  const createSql = await popup().locator('.cmp-sql-preview').innerText();
  check('create table preview', createSql.includes('CREATE TABLE `ui_db_test`.`items`') && createSql.includes('`id` int unsigned NOT NULL AUTO_INCREMENT')
    && createSql.includes("`price` decimal(10,2) NOT NULL DEFAULT '0'") && createSql.includes('PRIMARY KEY (`id`)') && createSql.includes('UNIQUE INDEX (`title`)')
    && createSql.includes("COMMENT = 'Shop items'"), createSql);
  await popup().getByRole('button', {name: 'Execute'}).click();
  await page.waitForTimeout(1500);
  check('table tab replaces create form', await activeTab() === `${DB}/items` && !(await tabLabels()).includes(`${DB}: new table`), JSON.stringify(await tabLabels()));

  // --- table options in structure
  await page.locator('.table-records-root:visible').getByRole('button', {name: 'Structure', exact: true}).click();
  await page.waitForTimeout(1200);
  const structure = page.locator('.cmp-structure-view:visible');
  await structure.getByRole('button', {name: 'Table options…'}).click();
  await page.waitForTimeout(500);
  await popup().getByLabel('Comment').fill('Items of shop');
  await popup().getByLabel('Auto increment').fill('50');
  await popup().getByRole('button', {name: 'Preview SQL'}).click();
  await page.waitForTimeout(600);
  const optionsSql = await popup().locator('.cmp-sql-preview').innerText();
  check('table options preview', optionsSql === "ALTER TABLE `ui_db_test`.`items`\n  COMMENT = 'Items of shop',\n  AUTO_INCREMENT = 50;", optionsSql);
  await popup().getByRole('button', {name: 'Execute'}).click();
  await page.waitForTimeout(1500);
  const info = await structure.locator('.structure-info').innerText();
  check('table options applied', /Auto increment\s*50/.test(info) && /Comment\s*Items of shop/.test(info), info);

  await sql(["INSERT INTO items (title, price) VALUES ('a', 1), ('b', 2)", 'CREATE TABLE logs (id INT PRIMARY KEY, item_id INT UNSIGNED, FOREIGN KEY (item_id) REFERENCES items (id))',
    'INSERT INTO logs VALUES (1, 50)'], DB);

  // --- overview: tables listed, routines
  await openTab(`${DB}: overview`);
  await overview.locator('button[title="Reload"]').click();
  await page.waitForTimeout(1000);
  const tableNames = await overview.locator('.overview-tables tbody td.name').allInnerTexts();
  check('overview lists tables', tableNames.join() === 'items,logs', tableNames.join());
  check('overview shows comment', (await overview.locator('.overview-tables tbody tr', {hasText: 'items'}).innerText()).includes('Items of shop'));

  await overview.getByRole('button', {name: 'New…'}).click();
  await page.getByRole('menuitem', {name: 'New procedure…'}).click();
  await page.waitForTimeout(1500);
  check('procedure editor with template', /New procedure in ui_db_test/.test(await popupTitle()) && await popup().locator('.monaco-editor').count() === 1, await popupTitle());
  await page.screenshot({path: `${OUT}/db-03-procedure-editor.png`});
  await popup().getByRole('button', {name: 'Preview SQL'}).click();
  await page.waitForTimeout(700);
  check('procedure preview', (await popup().locator('.cmp-sql-preview').innerText()).startsWith('CREATE PROCEDURE new_procedure(IN p_id INT)'), await popup().locator('.cmp-sql-preview').innerText());
  await popup().getByRole('button', {name: 'Execute'}).click();
  await page.waitForTimeout(1500);
  const routineRow = overview.locator('.structure-section', {hasText: 'Procedures and functions'}).locator('tbody tr', {hasText: 'new_procedure'});
  check('procedure listed with parameters', await routineRow.count() === 1 && /p_id int/.test(await routineRow.innerText()), await overview.locator('.structure-section', {hasText: 'Procedures'}).innerText());

  // execute with parameter - CALL in console
  await menu(routineRow, 'Execute…');
  await popup().getByLabel('p_id').fill('7');
  await popup().getByRole('button', {name: 'Execute in console'}).click();
  await page.waitForTimeout(2500);
  check('console of procedure opened', await activeTab() === 'Console: new_procedure()', await activeTab());
  const resultTabs = await page.locator('.cmp-sql-console:visible .console-result-tabs').innerText();
  await page.locator('.cmp-sql-console:visible').getByRole('tab', {name: /^Messages/}).click();
  const consoleLog = await page.locator('.cmp-sql-console:visible .console-messages').innerText();
  check('procedure executed in console', /CALL `ui_db_test`\.`new_procedure`\('7'\)/.test(consoleLog) && /✓/.test(consoleLog) && /Result 1/.test(resultTabs), consoleLog);

  // view from console query
  const editor = page.locator('.cmp-sql-console:visible .monaco-editor').first();
  await editor.click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('SELECT id, title FROM items WHERE price > 1');
  await page.locator('.cmp-sql-console:visible').getByRole('button', {name: 'Create view…'}).click();
  await page.waitForTimeout(400);
  await popup().getByLabel('View name').fill('v_expensive');
  await popup().getByRole('button', {name: 'Preview SQL'}).click();
  await page.waitForTimeout(600);
  check('view preview', (await popup().locator('.cmp-sql-preview').innerText()) === 'CREATE VIEW `ui_db_test`.`v_expensive` AS\nSELECT id, title FROM items WHERE price > 1;', await popup().locator('.cmp-sql-preview').innerText());
  await popup().getByRole('button', {name: 'Execute'}).click();
  await page.waitForTimeout(1200);
  check('view created', (await sql(['SELECT COUNT(*) AS n FROM v_expensive'], DB)).rows[0]?.n == 1);

  // edit and drop procedure
  await openTab(`${DB}: overview`);
  await overview.locator('button[title="Reload"]').click();
  await page.waitForTimeout(800);
  check('view listed', (await overview.locator('.overview-tables tbody td.name').allInnerTexts()).includes('v_expensive'));
  await menu(routineRow, 'Edit…');
  await page.waitForTimeout(1500);
  const editorText = await popup().locator('.monaco-editor .view-lines').innerText();
  check('edit loads definition', /Edit procedure new_procedure/.test(await popupTitle()) && /PROCEDURE `new_procedure`/.test(editorText.replace(/ /g, ' ')), editorText);
  await popup().getByRole('button', {name: 'Cancel'}).click();
  await menu(routineRow, 'Drop…');
  await page.waitForTimeout(600);
  check('drop procedure preview', (await popup().locator('.cmp-sql-preview').innerText()) === 'DROP PROCEDURE `ui_db_test`.`new_procedure`;');
  await hold(popup().getByRole('button', {name: 'Hold to execute'}));
  await page.waitForTimeout(1200);
  check('procedure dropped', await routineRow.count() === 0);

  // --- operations on selected tables
  await overview.getByLabel('Select items').check();
  await overview.getByLabel('Select logs').check();
  check('selection count', /2 selected/.test(await overview.locator('.overview-selected').innerText()));
  await overview.locator('.overview-selection').getByRole('button', {name: 'Optimize'}).click();
  await page.waitForTimeout(2000);
  const results = await popup().innerText();
  check('optimize results for both tables', /ui_db_test\.items/.test(results) && /ui_db_test\.logs/.test(results), results);
  await page.screenshot({path: `${OUT}/db-04-optimize.png`});
  await popup().getByRole('button', {name: 'Close'}).click();

  await overview.locator('.overview-selection').getByRole('button', {name: 'Truncate'}).click();
  await page.waitForTimeout(700);
  await popup().getByText('Disable foreign key checks').click();
  await page.waitForTimeout(700);
  const truncateSql = await popup().locator('.cmp-sql-preview').innerText();
  check('truncate preview with disabled checks', truncateSql.startsWith('SET FOREIGN_KEY_CHECKS = 0;') && truncateSql.includes('TRUNCATE TABLE `ui_db_test`.`logs`'), truncateSql);
  await hold(popup().getByRole('button', {name: 'Hold to execute'}));
  await page.waitForTimeout(1200);
  check('tables truncated', (await sql(['SELECT (SELECT COUNT(*) FROM items) + (SELECT COUNT(*) FROM logs) AS n'], DB)).rows[0]?.n == 0);

  // sidebar menu of table - maintenance
  await sidebarDatabase(DB).click();
  await page.waitForTimeout(800);
  const sidebarTable = page.locator('.table-list-menu-root li', {hasText: /^items$/});
  await sidebarTable.click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Maintenance'}).hover();
  await page.waitForTimeout(300);
  await page.getByRole('menuitem', {name: 'Analyze'}).click();
  await page.waitForTimeout(1500);
  check('analyze from sidebar', /ui_db_test\.items/.test(await popup().innerText()) && /Analyze - results/.test(await popupTitle()), await popup().innerText());
  await popup().getByRole('button', {name: 'Close'}).click();

  await overview.getByLabel('Select all tables').check();
  await overview.locator('.overview-selection').getByRole('button', {name: 'Drop'}).click();
  await page.waitForTimeout(700);
  const dropSql = await popup().locator('.cmp-sql-preview').innerText();
  check('drop preview separates views and tables', dropSql.includes('DROP VIEW `ui_db_test`.`v_expensive`;') && dropSql.includes('DROP TABLE `ui_db_test`.`items`, `ui_db_test`.`logs`;'), dropSql);
  await popup().getByText('Disable foreign key checks').click();
  await page.waitForTimeout(600);
  await hold(popup().getByRole('button', {name: 'Hold to execute'}));
  await page.waitForTimeout(1500);
  check('tables dropped', /No tables/.test(await overview.innerText()));
  check('sidebar table list reloaded', await page.locator('.table-list-menu-root li', {hasText: /^items$/}).count() === 0);

  // --- rename and drop database from sidebar
  await sql(['CREATE TABLE kept (id INT)'], DB);
  await menu(sidebarDatabase(DB), 'Rename database…');
  await popup().getByLabel('Name').fill(DB2);
  await popup().getByRole('button', {name: 'Preview SQL'}).click();
  await page.waitForTimeout(700);
  check('rename preview moves tables', (await popup().locator('.cmp-sql-preview').innerText()).includes(`RENAME TABLE\n  \`${DB}\`.\`kept\` TO \`${DB2}\`.\`kept\``), await popup().locator('.cmp-sql-preview').innerText());
  await hold(popup().getByRole('button', {name: 'Hold to execute'}));
  await page.waitForTimeout(2000);
  check('renamed database in sidebar', await sidebarDatabase(DB2).count() === 1 && await sidebarDatabase(DB).count() === 0);

  await menu(sidebarDatabase(DB2), 'Drop database…');
  await page.waitForTimeout(600);
  check('drop database preview', (await popup().locator('.cmp-sql-preview').innerText()) === `DROP DATABASE \`${DB2}\`;`);
  await hold(popup().getByRole('button', {name: 'Hold to execute'}));
  await page.waitForTimeout(2000);
  check('dropped database removed from sidebar', await sidebarDatabase(DB2).count() === 0 && await sidebarDatabase('shop').count() === 1);
  await page.screenshot({path: `${OUT}/db-05-done.png`});

  // --- restore after reload: overview tab comes back
  await openTab(`${DB}: overview`);
  await page.reload();
  await page.waitForTimeout(2500);
  check('overview tab restored', (await tabLabels()).includes(`${DB}: overview`), JSON.stringify(await tabLabels()));

  // --- PostgreSQL: overview of schema from sidebar menu
  const pg = {id: 'ui-db-pg', dsn: 'postgresql://postgres:5432/shop', username: 'flase', displayName: 'UI pg', changeConfirmationRequired: false};
  const pgUser = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: pg})})).json();
  await page.evaluate(([pg, pgUser]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([pg]));
    localStorage.setItem('established_connections', JSON.stringify({[pg.id]: {user: pgUser, connection: pg}}));
  }, [pg, pgUser]);
  await page.reload();
  await page.waitForTimeout(1500);
  await page.getByText('UI pg', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(1000);
  check('create schema button', await page.locator('button[title="Create schema"]').count() === 1);
  await menu(sidebarDatabase('public'), 'Overview');
  await page.waitForTimeout(1500);
  check('schema overview opened', await activeTab() === 'public: overview', await activeTab());
  const pgOverview = page.locator('.cmp-database-overview:visible');
  const pgTables = await pgOverview.locator('.overview-tables tbody td.name').allInnerTexts();
  const pgButtons = await pgOverview.locator('.overview-selection button').allInnerTexts();
  check('schema tables listed', pgTables.includes('customers') && pgTables.includes('orders'), pgTables.join());
  check('PostgreSQL maintenance actions', pgButtons.join('|').includes('Vacuum') && pgButtons.join('|').includes('Reindex') && !pgButtons.join('|').includes('Optimize'), pgButtons.join('|'));
  check('no events section, database of connection instead of collation', !(await pgOverview.innerText()).includes('Events')
    && (await pgOverview.locator('.overview-chip').allInnerTexts()).join() === 'database shop', (await pgOverview.locator('.overview-chip').allInnerTexts()).join());
  await pgOverview.getByLabel('Select customers').check();
  await pgOverview.locator('.overview-selection').getByRole('button', {name: 'Vacuum analyze'}).click();
  await page.waitForTimeout(2000);
  check('vacuum analyze from overview', /customers/.test(await popup().innerText()) && /OK/.test(await popup().innerText()), await popup().innerText());
  await page.screenshot({path: `${OUT}/db-06-postgres.png`});
  await popup().getByRole('button', {name: 'Close'}).click();

  const shown = errors.filter((e) => !/ResizeObserver|Database ui_db_test does not exist/.test(e));
  check('no page errors', shown.length === 0, shown.join(' | '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
