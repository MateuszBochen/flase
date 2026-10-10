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
  const grid = page.locator('.cmp-records-view').last();
  check('data view first', await grid.locator('.data-table-row').count() === 2);
  await page.locator('.table-records-root:visible').getByRole('button', {name: 'Structure', exact: true}).click();
  await page.waitForTimeout(1200);
  const view = page.locator('.cmp-structure-view').last();
  await page.screenshot({path: `${OUT}/61-structure.png`, fullPage: true});
  check('data view hidden', !(await grid.isVisible()));
  const sectionText = async (title) => (await view.locator('.structure-section').filter({has: page.locator('h3', {hasText: title})}).innerText());
  check('info shown', /Engine\s*InnoDB/.test(await view.locator('.structure-info').innerText()), await view.locator('.structure-info').innerText());
  const columns = await sectionText('Columns');
  check('columns section', columns.includes('total_x2') && columns.includes("it's untitled") && columns.includes('business code'), columns.slice(0, 200));
  check('indexes section', (await sectionText('Indexes')).includes('title(10), status'));
  check('trigger section', (await sectionText('Triggers')).includes('UPPER(NEW.code)'));
  check('ddl section', (await sectionText('DDL')).includes('CREATE TABLE `struct_test`'));

  await view.getByRole('button', {name: 'Copy', exact: true}).click();
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check('DDL copied', clip.startsWith('CREATE TABLE `struct_test`') && clip.trim().endsWith(';'), clip.slice(0, 40));

  // back to data - grid still there with its rows
  await page.locator('.table-records-root:visible').getByRole('button', {name: 'Data', exact: true}).click();
  await page.waitForTimeout(300);
  check('data view kept rows', await grid.isVisible() && await grid.locator('.data-table-row').count() === 2);

  // open referencing table from "Referenced by"
  await page.locator('.table-records-root:visible').getByRole('button', {name: 'Structure', exact: true}).click();
  await view.locator('.structure-section').filter({has: page.locator('h3', {hasText: 'Referenced by'})}).getByRole('button', {name: 'struct_child'}).click();
  await page.waitForTimeout(1500);
  const tabs = await page.locator('.tab-label-list-item, .tab-item, [class*="tab-label"]').allInnerTexts();
  check('referenced table opened in new tab', tabs.some((t) => t.includes('shop/struct_child')), JSON.stringify(tabs));

  // view
  await page.getByText('struct_view', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1200);
  const visibleTab = page.locator('.table-records-root:visible');
  await visibleTab.getByRole('button', {name: 'Structure', exact: true}).click();
  await page.waitForTimeout(1200);
  const viewText = await visibleTab.locator('.cmp-structure-view').innerText();
  await page.screenshot({path: `${OUT}/62-view.png`});
  check('view structure', viewText.includes('VIEW') && viewText.includes('CREATE ALGORITHM'), viewText.slice(0, 120));

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
