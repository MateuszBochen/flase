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
  const page = await browser.newPage({viewport: {width: 1500, height: 900}});
  const errors = [];
  let selectsSent = 0;
  page.on('websocket', (ws) => ws.on('framesent', (frame) => {
    if (String(frame.payload).includes('SEND_SELECT_QUERY')) selectsSent++;
  }));
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
  await page.getByText('edit_test', {exact: true}).first().dispatchEvent('mousedown');
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
  const rows = grid.locator('.data-table-row');
  const firstVisibleId = async () => (await rows.nth(0).locator('.data-table-cell').nth(0).innerText()).trim();
  const footerText = async () => (await grid.locator('.pager-info').innerText()).replace(/\s+/g, ' ');

  // scroll down with mouse wheel
  const content = grid.locator('.data-table-content');
  const box = await content.boundingBox();
  await page.mouse.move(box.x + 300, box.y + 100);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 100); await page.waitForTimeout(30); }
  await page.waitForTimeout(300);
  const scrolledId = await firstVisibleId();
  check('grid scrolled down', +scrolledId > 50, scrolledId);
  console.log('footer before:', await footerText());

  // --- update cell, submit: no reload, same position
  selectsSent = 0;
  const nameCell = rows.nth(3).locator('.data-table-cell').nth(1);
  const editedId = (await rows.nth(3).locator('.data-table-cell').nth(0).innerText()).trim();
  await nameCell.dblclick();
  await grid.locator('.cell-editor-input').fill('edited at bottom');
  await grid.locator('.cell-editor-input').press('Enter');
  await grid.getByRole('button', {name: 'Submit'}).click();
  await page.waitForTimeout(1500);
  check('update: no SELECT sent', selectsSent === 0, String(selectsSent));
  check('update: position kept', await firstVisibleId() === scrolledId, `${await firstVisibleId()} vs ${scrolledId}`);
  check('update: value shown, not marked changed', (await nameCell.innerText()).includes('edited at bottom') && await rows.nth(3).locator('.data-table-cell.changed').count() === 0, await nameCell.innerText());
  check('update: no pending', await grid.locator('.pending-count').count() === 0);
  console.log(`EDITED_ID=${editedId}`);

  // --- delete row, submit: no reload, row disappears, total decreases
  const deletedId = (await rows.nth(2).locator('.data-table-cell').nth(0).innerText()).trim();
  await rows.nth(2).locator('.data-table-cell').nth(0).click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Delete row', exact: true}).click();
  await grid.getByRole('button', {name: 'Submit'}).click();
  await page.waitForTimeout(1500);
  console.log(`DELETED_ID=${deletedId}`);
  const idsAfterDelete = (await rows.allInnerTexts()).map((t) => t.split('\n')[0].trim());
  check('delete: no SELECT sent', selectsSent === 0, String(selectsSent));
  check('delete: row removed in place', !idsAfterDelete.includes(deletedId) && await firstVisibleId() === scrolledId, `${deletedId} in ${idsAfterDelete.slice(0, 5)}`);
  const footer = await footerText();
  check('delete: footer counts decreased', footer.includes('/ 149') && footer.includes('- 99'), footer);

  // --- add row, submit: reload needed (auto increment id), position kept
  const box2 = await content.boundingBox();
  await page.mouse.click(box2.x + 300, box2.y + 60, {button: 'right'});
  await page.getByRole('menuitem', {name: 'Add row…', exact: true}).click();
  const form = page.locator('.cmp-row-form');
  const nameField = form.locator('.row-form-field').filter({hasText: 'varchar(50)'});
  await nameField.locator('.row-form-default').click();
  await nameField.locator('.cell-editor-input').fill('inserted');
  await page.getByRole('button', {name: 'Save'}).click();
  await page.waitForTimeout(300);
  // grid scrolls to the end to show the new row
  const beforeSubmitId = await firstVisibleId();
  check('new row is visible', await grid.locator('.data-table-row.row-inserted').isVisible());
  await grid.getByRole('button', {name: 'Submit'}).click();
  await page.waitForTimeout(2000);
  check('insert: query reloaded once', selectsSent === 1, String(selectsSent));
  check('insert: position kept after reload', await firstVisibleId() === beforeSubmitId, `${await firstVisibleId()} vs ${beforeSubmitId}`);
  check('insert: footer from database', (await footerText()).includes('/ 150'), await footerText());
  await page.screenshot({path: `${OUT}/31-after-insert.png`});

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
