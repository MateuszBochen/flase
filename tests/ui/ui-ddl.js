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
  await page.getByText('struct_test', {exact: true}).first().dispatchEvent('mousedown');
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
  const structureView = () => visibleTab().locator('.cmp-structure-view');
  const toStructure = async () => { await visibleTab().getByRole('button', {name: 'Structure', exact: true}).click(); await page.waitForTimeout(1000); };
  const sqlPreview = async () => { await page.waitForTimeout(700); return (await page.locator('.cmp-sql-preview').innerText()).trim(); };
  const execute = async () => { await page.getByRole('button', {name: 'Execute', exact: true}).click(); await page.waitForTimeout(1500); };
  const holdExecute = async () => {
    const button = page.getByRole('button', {name: 'Hold to execute'});
    const box = await button.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(3000);
    await page.mouse.up();
    await page.waitForTimeout(1500);
  };
  const columnNames = async () => (await structureView().locator('.structure-section').first().locator('tbody td.name').allInnerTexts());
  const formInput = (label) => page.locator('.cmp-structure-form label').filter({hasText: label}).locator('input, select').first();

  // --- copy table with data
  await toStructure();
  await visibleTab().getByRole('button', {name: 'Copy table…'}).click();
  await formInput('New name').fill('ui_ddl');
  await page.getByRole('button', {name: 'Preview SQL'}).click();
  const copySql = await sqlPreview();
  check('copy preview', copySql.includes('CREATE TABLE `shop`.`ui_ddl` LIKE `shop`.`struct_test`') && copySql.includes('INSERT INTO `shop`.`ui_ddl` (`id`'), copySql);
  await execute();
  await page.waitForTimeout(1000);
  const tabNames = await page.locator('[class*="tab-label"]').allInnerTexts();
  check('copy opened in new tab', tabNames.some((t) => t.includes('shop/ui_ddl')), JSON.stringify(tabNames));
  await page.locator('[class*="tab-label"]').filter({hasText: 'shop/ui_ddl'}).last().click();
  await page.waitForTimeout(1500);
  check('copied data', await visibleTab().locator('.data-table-row').count() === 2, String(await visibleTab().locator('.data-table-row').count()));

  // --- add column through form
  await toStructure();
  await structureView().getByRole('button', {name: '+ Add column'}).click();
  await formInput('Name').fill('note');
  await formInput('Type').fill('varchar(40)');
  await formInput('Default').selectOption('value');
  await page.locator('.cmp-structure-form .inline input').fill("it's");
  await formInput('Comment').fill('ui note');
  await formInput('Position').selectOption('after:code');
  await page.screenshot({path: `${OUT}/71-add-column.png`});
  await page.getByRole('button', {name: 'Preview SQL'}).click();
  const addSql = await sqlPreview();
  await page.screenshot({path: `${OUT}/72-add-column-preview.png`});
  check('add column preview', addSql === "ALTER TABLE `shop`.`ui_ddl`\n  ADD COLUMN `note` varchar(40) NULL DEFAULT 'it\\'s' COMMENT 'ui note' AFTER `code`;", addSql);
  await execute();
  check('column added', (await columnNames()).slice(0, 3).join() === 'id,code,note', (await columnNames()).join());
  await visibleTab().getByRole('button', {name: 'Data', exact: true}).click();
  await page.waitForTimeout(1000);
  const headers = await visibleTab().locator('.header-cell .column-name').allInnerTexts();
  check('data tab reloaded with new column', headers.includes('note'), headers.join());

  // --- change column (double click), keeps collation
  await toStructure();
  await structureView().locator('tbody tr').filter({has: page.locator('td.name', {hasText: /^note$/})}).dblclick();
  await formInput('Name').fill('memo');
  await formInput('Type').fill('varchar(80)');
  await page.getByRole('button', {name: 'Preview SQL'}).click();
  const changeSql = await sqlPreview();
  check('change column preview keeps collation', changeSql.startsWith('ALTER TABLE `shop`.`ui_ddl`\n  CHANGE COLUMN `note` `memo` varchar(80) COLLATE utf8mb4_unicode_ci NULL'), changeSql);
  await execute();
  check('column changed', (await columnNames()).includes('memo') && !(await columnNames()).includes('note'));

  // --- error keeps form open
  await structureView().getByRole('button', {name: '+ Add column'}).click();
  await formInput('Name').fill('memo');
  await page.getByRole('button', {name: 'Preview SQL'}).click();
  await page.waitForTimeout(700);
  await execute();
  const errorToasts = (await page.locator('[role="status"]').allInnerTexts()).join(' | ');
  check('sql error shown, form stays open', /Duplicate column/i.test(errorToasts) && await page.locator('.cmp-structure-form').count() === 1, errorToasts);
  await page.getByRole('button', {name: 'Cancel'}).last().click();
  await page.waitForTimeout(300);
  if (await page.locator('.cmp-structure-form').count()) await page.getByRole('button', {name: 'Cancel'}).last().click();

  // --- add index, then drop it from context menu (hold to execute)
  await structureView().getByRole('button', {name: '+ Add index'}).click();
  await formInput('Name').fill('idx_ui');
  const indexColumn = (name) => page.locator('.index-column').filter({has: page.locator('label', {hasText: new RegExp(`^\\d*${name}\\s`)})});
  await indexColumn('memo').locator('input[type="checkbox"]').check();
  await indexColumn('memo').locator('input.length').fill('5');
  await indexColumn('status').locator('input[type="checkbox"]').check();
  await page.screenshot({path: `${OUT}/74-index-form.png`});
  await page.getByRole('button', {name: 'Preview SQL'}).click();
  const indexSql = await sqlPreview();
  check('add index preview', indexSql.endsWith('ADD INDEX `idx_ui` (`memo`(5), `status`);'), indexSql);
  await execute();
  const indexSection = structureView().locator('.structure-section').filter({has: page.locator('h3', {hasText: 'Indexes'})});
  check('index added', (await indexSection.innerText()).includes('memo(5), status'));
  await indexSection.locator('tbody tr').filter({hasText: 'idx_ui'}).click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Drop index'}).click();
  const dropIndexSql = await sqlPreview();
  check('drop index needs hold', dropIndexSql.endsWith('DROP INDEX `idx_ui`;') && await page.getByRole('button', {name: 'Hold to execute'}).count() === 1, dropIndexSql);
  // short click does nothing
  await page.getByRole('button', {name: 'Hold to execute'}).click();
  await page.waitForTimeout(800);
  check('short click does not execute', (await indexSection.innerText()).includes('idx_ui'));
  await holdExecute();
  check('index dropped after hold', !(await indexSection.innerText()).includes('idx_ui'));

  // --- truncate started from data view - stays in data view
  await visibleTab().getByRole('button', {name: 'Data', exact: true}).click();
  await page.waitForTimeout(300);
  await page.screenshot({path: `${OUT}/75-toolbar-data.png`});
  await visibleTab().getByRole('button', {name: 'Truncate table…'}).click();
  check('truncate preview', (await sqlPreview()) === 'TRUNCATE TABLE `shop`.`ui_ddl`;');
  await holdExecute();
  check('still in data view after truncate', await visibleTab().locator('.cmp-records-view').isVisible());
  await page.waitForTimeout(800);
  check('data reloaded after truncate', await visibleTab().locator('.data-table-row').count() === 0 && (await visibleTab().locator('.cmp-records-view-message').innerText()).includes('No rows'));

  // --- reload in data view runs query again, in structure view loads structure
  await toStructure();
  await page.screenshot({path: `${OUT}/76-toolbar-structure.png`});
  check('query editor hidden in structure view', !(await visibleTab().locator('.cmp-table-data-navbar').isVisible()));
  await visibleTab().getByRole('button', {name: 'Reload structure'}).click();
  await page.waitForTimeout(800);
  check('reload structure works', (await columnNames()).includes('memo'));

  // --- rename, then drop the renamed table
  await visibleTab().getByRole('button', {name: 'Rename table…'}).click();
  await formInput('New name').fill('ui_ddl2');
  await page.getByRole('button', {name: 'Preview SQL'}).click();
  check('rename preview', (await sqlPreview()) === 'RENAME TABLE `shop`.`ui_ddl` TO `shop`.`ui_ddl2`;');
  await execute();
  check('old tab says renamed', (await structureView().locator('.structure-gone').innerText()).includes('renamed to ui_ddl2'));
  check('actions disabled after rename', await visibleTab().getByRole('button', {name: 'Drop table…'}).isDisabled());
  await page.locator('[class*="tab-label"]').filter({hasText: 'shop/ui_ddl2'}).last().click();
  await page.waitForTimeout(1500);
  await toStructure();
  await visibleTab().getByRole('button', {name: 'Drop table…'}).click();
  check('drop preview', (await sqlPreview()) === 'DROP TABLE `shop`.`ui_ddl2`;');
  await holdExecute();
  check('dropped banner', (await structureView().locator('.structure-gone').innerText()).includes('dropped'));
  await page.waitForTimeout(1000);
  const sidebar = await page.locator('.table-list-menu-root').innerText();
  check('sidebar list refreshed', !sidebar.includes('ui_ddl') && sidebar.includes('struct_test'), sidebar.replace(/\n/g, ','));
  await page.screenshot({path: `${OUT}/73-dropped.png`});

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
