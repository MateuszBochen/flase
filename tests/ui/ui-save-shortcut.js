// Ctrl+S submits changes of grid also right after inline edit (editor removed, focus on body) and after popup;
// popup is closed by Escape and click outside.
// node ui-save-shortcut.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};

(async () => {
  const connection = {id: 'ui-save-shortcut', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Shortcut test', changeConfirmationRequired: false};
  const user = await (await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();

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
  await page.getByText('Shortcut test', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(1000);
  await page.getByText('edit_test', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);

  // Ctrl+S not handled by application would open "Save page" of browser
  await page.evaluate(() => {
    window.__saveShortcuts = [];
    window.addEventListener('keydown', (event) => {
      if (event.ctrlKey && event.key.toLowerCase() === 's') window.__saveShortcuts.push(event.defaultPrevented);
    });
  });

  const grid = () => page.locator('.table-records-root:visible .cmp-records-view');
  const rows = () => grid().locator('.data-table-row');
  const columnIndex = async (name) => (await grid().locator('.header-cell .column-name').allInnerTexts()).indexOf(name);
  const cell = async (row, name) => rows().nth(row).locator('.data-table-cell').nth(await columnIndex(name));
  const cellText = async (row, name) => (await (await cell(row, name)).innerText()).trim();
  const pending = () => grid().locator('.data-table-cell.changed').count();

  // --- double click, Enter, Ctrl+S at once
  await (await cell(0, 'name')).dblclick();
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+A');
  await page.keyboard.type('saved by shortcut');
  await page.keyboard.press('Enter');
  check('change is pending', await pending() === 1);
  await page.keyboard.press('Control+S');
  await page.waitForTimeout(1500);
  check('Ctrl+S right after inline edit submits', await pending() === 0 && await cellText(0, 'name') === 'saved by shortcut', await cellText(0, 'name'));

  // --- Escape of editor, then other edit by popup, Ctrl+S after popup was closed
  await (await cell(1, 'name')).dblclick();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await (await cell(1, 'name')).click({button: 'right'});
  await page.getByRole('menuitem', {name: 'Edit cell…', exact: true}).click();
  await page.waitForTimeout(300);
  await page.locator('.cmp-value-editor textarea').fill('saved after popup');
  await page.getByRole('button', {name: 'Save', exact: true}).click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Control+S');
  await page.waitForTimeout(1500);
  check('Ctrl+S after popup submits', await pending() === 0 && await cellText(1, 'name') === 'saved after popup', await cellText(1, 'name'));
  await page.screenshot({path: `${OUT}/save-shortcut.png`});

  // --- popup is closed by Escape and by click outside, not by text selection dragged out of it
  const openPopup = async () => {
    await (await cell(2, 'name')).click({button: 'right'});
    await page.getByRole('menuitem', {name: 'Edit cell…', exact: true}).click();
    await page.waitForTimeout(300);
  };
  const popupOpen = () => page.locator('.popup-root').count();
  await openPopup();
  await page.locator('.cmp-value-editor textarea').fill('not saved');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Escape closes popup without saving', await popupOpen() === 0 && await pending() === 0);
  await openPopup();
  const box = await page.locator('.popup-content').boundingBox();
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(5, 5, {steps: 5});
  await page.mouse.up();
  await page.waitForTimeout(300);
  check('selection dragged out of popup keeps it open', await popupOpen() === 1);
  await page.mouse.click(5, 5);
  await page.waitForTimeout(300);
  check('click outside closes popup', await popupOpen() === 0 && await pending() === 0);

  const shortcuts = await page.evaluate(() => window.__saveShortcuts);
  check('browser does not save page', shortcuts.length === 2 && shortcuts.every(Boolean), JSON.stringify(shortcuts));
  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
