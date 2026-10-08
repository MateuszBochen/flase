// UI test of PostgreSQL connection. node ui-postgres.js
const {chromium} = require('playwright');
const fs = require('fs');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};

(async () => {
  const connection = {id: 'ui-pg', dsn: 'postgresql://postgres:5432/shop', username: 'flase', displayName: 'PG test', changeConfirmationRequired: false};
  const res = await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})});
  const user = await res.json();

  const browser = await chromium.launch();
  const context = await browser.newContext({viewport: {width: 1500, height: 900}, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.removeItem('query_history'); localStorage.removeItem('saved_queries'); localStorage.removeItem('connections'); localStorage.removeItem('established_connections');
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
  }, [connection, user]);
  await page.reload();
  await page.waitForTimeout(1500);

  await page.getByText('PG test', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  const schemas = await page.locator('.cmp-table-list-menu, body').first().innerText();
  check('schemas in tree', /blog/.test(schemas) && /public/.test(schemas), schemas.slice(0, 200));
  await page.getByText('public', {exact: true}).first().click();
  await page.waitForTimeout(1200);
  await page.screenshot({path: `${OUT}/p1-tree.png`});

  const visibleTab = () => page.locator('.table-records-root:visible');
  const grid = () => visibleTab().locator('.cmp-records-view');
  const rows = () => grid().locator('.data-table-row');
  const query = async () => (await visibleTab().locator('.monaco-editor').innerText()).replace(/\s+/g, ' ').trim();
  const columnIndex = async (name) => (await grid().locator('.header-cell .column-name').allInnerTexts()).indexOf(name);
  const cell = async (row, name) => rows().nth(row).locator('.data-table-cell').nth(await columnIndex(name));

  // --- data grid
  await page.getByText('edit_test', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  await page.screenshot({path: `${OUT}/p2-grid.png`});
  check('default query in PostgreSQL syntax', (await query()) === 'SELECT * FROM "edit_test" LIMIT 100 OFFSET 0', await query());
  check('rows shown', await rows().count() === 3, String(await rows().count()));
  check('values as in database', (await (await cell(0, 'created')).innerText()).trim() === '2026-01-02 03:04:05' && (await (await cell(0, 'big')).innerText()).trim() === '9007199254740993');

  await grid().locator('.header-cell').nth(await columnIndex('name')).locator('.sort-box button').nth(1).dispatchEvent('mousedown');
  await page.waitForTimeout(1200);
  check('sort keeps dialect', /^SELECT \* FROM "edit_test" ORDER BY "name" DESC LIMIT 100 OFFSET 0$/.test(await query()) && (await (await cell(0, 'name')).innerText()).trim() === 'c', await query());

  // quick filter from cell
  await (await cell(0, 'name')).click({button: 'right'});
  await page.getByRole('menuitem', {name: /^Filter: name = /}).click();
  await page.waitForTimeout(1200);
  check('quick filter quoted for PostgreSQL', (await query()).includes(`WHERE "name" = 'c'`) && await rows().count() === 1, await query());
  await page.getByText('edit_test', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1200);

  // edit enum + text with apostrophe and backslash
  await (await cell(1, 'note')).dblclick();
  await grid().locator('.cell-editor-input').fill("it's C:\\temp");
  await grid().locator('.cell-editor-input').press('Enter');
  await (await cell(1, 'status')).dblclick();
  await grid().locator('select.cell-editor-input').selectOption("it's done");
  await grid().locator('select.cell-editor-input').press('Enter');
  await grid().getByRole('button', {name: 'Preview SQL'}).click();
  await page.waitForTimeout(800);
  const preview = await page.locator('.cmp-sql-preview').innerText();
  check('edit preview in PostgreSQL syntax', preview.includes(`UPDATE "public"."edit_test" SET "note" = E'it''s C:\\\\temp', "status" = 'it''s done' WHERE "id" = 2`), preview);
  await page.getByRole('button', {name: 'Close'}).click();
  await grid().getByRole('button', {name: 'Submit'}).click();
  await page.waitForTimeout(1800);
  check('edit saved', (await (await cell(1, 'note')).innerText()).trim() === "it's C:\\temp" && await grid().locator('.data-table-cell.changed').count() === 0, await (await cell(1, 'note')).innerText());

  // copy as INSERT
  await (await cell(0, 'id')).click();
  await (await cell(0, 'id')).click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Copy selection as', exact: true}).hover();
  await page.waitForTimeout(200);
  await page.getByRole('menuitem', {name: 'SQL INSERT', exact: true}).click();
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('copy as INSERT with PostgreSQL quoting', clip.startsWith('INSERT INTO "edit_test" ("id") VALUES'), clip);

  // --- structure
  await visibleTab().getByRole('button', {name: 'Structure', exact: true}).click();
  await page.waitForTimeout(1200);
  const structureView = () => visibleTab().locator('.cmp-structure-view');
  await page.screenshot({path: `${OUT}/p3-structure.png`, fullPage: true});
  const structureText = await structureView().innerText();
  check('structure shown', structureText.includes('edit_status') && structureText.includes('Access method') && structureText.includes('CREATE TABLE "edit_test"'), structureText.slice(0, 300));
  await structureView().getByRole('button', {name: '+ Add column'}).click();
  await page.waitForTimeout(300);
  const formText = await page.locator('.cmp-structure-form').innerText();
  const typeOptions = await page.locator('#structure-column-types option').evaluateAll((items) => items.map((item) => item.value));
  check('column form without MySQL options', !/Position/.test(formText) && typeOptions.includes('jsonb') && !typeOptions.includes('mediumtext'), formText);
  const formInput = (label) => page.locator('.cmp-structure-form label').filter({hasText: label}).locator('input, select').first();
  await formInput('Name').fill('ui_note');
  await formInput('Type').fill('varchar(40)');
  await formInput('Default').selectOption('value');
  await page.locator('.cmp-structure-form .inline input').fill("it's");
  await page.getByRole('button', {name: 'Preview SQL'}).click();
  await page.waitForTimeout(800);
  const addSql = (await page.locator('.cmp-sql-preview').innerText()).trim();
  check('add column preview', addSql === `ALTER TABLE "public"."edit_test"\n  ADD COLUMN "ui_note" varchar(40) DEFAULT 'it''s' NULL;`, addSql);
  await page.getByRole('button', {name: 'Execute', exact: true}).click();
  await page.waitForTimeout(1800);
  check('column added', (await structureView().innerText()).includes('ui_note'));
  await structureView().getByRole('button', {name: '+ Add index'}).click();
  await page.waitForTimeout(300);
  const kinds = await page.locator('.cmp-structure-form select').first().evaluate((select) => Array.from(select.options).map((option) => option.value));
  check('index kinds without FULLTEXT', JSON.stringify(kinds) === JSON.stringify(['INDEX', 'UNIQUE', 'PRIMARY']), JSON.stringify(kinds));
  await page.getByRole('button', {name: 'Cancel'}).click();

  // --- console
  await page.locator('.table-list-filter button[title="SQL console for public"]').dispatchEvent('mousedown');
  await page.waitForTimeout(1200);
  const consoleTab = () => page.locator('.cmp-sql-console:visible');
  check('console label for schema', (await consoleTab().locator('.console-database option').first().innerText()) === '— no schema —' && (await consoleTab().locator('.console-database').inputValue()) === 'public');
  await page.evaluate((text) => {
    const editor = window.monaco.editor.getEditors().find((item) => item.getContainerDomNode().closest('.cmp-sql-console') && item.getContainerDomNode().offsetParent);
    editor.setValue(text);
    editor.focus();
  }, "DO $$\nBEGIN\n  RAISE NOTICE 'semicolon; inside';\nEND\n$$;\nUSE blog;\nSELECT count(*) AS posts FROM posts;");
  await page.keyboard.press('Control+Shift+Enter');
  await page.waitForTimeout(2500);
  await page.screenshot({path: `${OUT}/p4-console.png`});
  const tabs = await consoleTab().locator('.console-result-tabs button').allInnerTexts();
  check('console: $$ body kept as one statement, USE switches schema', tabs.length === 2 && (await consoleTab().locator('.console-database').inputValue()) === 'blog', JSON.stringify(tabs));
  await consoleTab().locator('.console-result-tabs button').first().click();
  const log = (await consoleTab().locator('.console-messages').innerText()).replace(/\s+/g, ' ');
  check('console messages', /NOTICE: semicolon; inside/.test(log) && !/error/i.test(log), log);

  // completion quotes mixed case names
  const completion = await page.evaluate(() => {
    const editor = window.monaco.editor.getEditors().find((item) => item.getContainerDomNode().closest('.cmp-sql-console') && item.getContainerDomNode().offsetParent);
    editor.setValue('SELECT * FROM pos');
    editor.setPosition({lineNumber: 1, column: 18});
    editor.focus();
    return true;
  });
  await page.keyboard.press('Control+Space');
  await page.waitForTimeout(800);
  const suggestions = await page.locator('.monaco-editor .suggest-widget .monaco-list-row').allInnerTexts();
  check('completion offers tables of schema', completion && suggestions.some((text) => text.startsWith('posts')), JSON.stringify(suggestions.slice(0, 5)));
  await page.keyboard.press('Escape');

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
