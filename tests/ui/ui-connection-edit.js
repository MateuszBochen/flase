// Edit of connection in popup with the same form as new connection: values filled in, host / DSN, test, save,
// save & connect, address locked while connected, name already used
// node ui-connection-edit.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};

(async () => {
  // address not in form built from fields (no port) - opened in DSN mode
  const connection = {id: 'ui-connection-edit', dsn: 'mysql://mariadb', username: 'wrong_user', displayName: 'Edit me', changeConfirmationRequired: false};
  const other = {id: 'ui-connection-other', dsn: 'postgresql://postgres:5432/shop', username: 'flase', displayName: 'Other one', changeConfirmationRequired: false};

  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1400, height: 900}})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:3000');
  await page.evaluate((connections) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify(connections));
  }, [connection, other]);
  await page.reload();
  await page.waitForTimeout(1500);

  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('connections'))[0]);
  const established = () => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('established_connections') || '{}')));
  const popup = page.locator('.popup-content');
  const form = popup.locator('.cmp-new-connection.in-popup');
  const field = (label) => form.locator('label.field', {has: page.locator(`span:text-is("${label}")`)}).locator('input');
  const fieldStarting = (label) => form.locator('label.field', {has: page.locator('span', {hasText: new RegExp(`^${label}`)})}).locator('input');
  const openSettings = async () => {
    // menu of connection is open after first click, other click would close it
    if (!await page.locator('[title^="Connection settings"]').first().isVisible()) {
      await page.getByText(await page.evaluate(() => JSON.parse(localStorage.getItem('connections'))[0].displayName), {exact: true}).click();
      await page.waitForTimeout(300);
    }
    await page.locator('[title^="Connection settings"]').first().click();
    await page.waitForTimeout(400);
  };

  // --- form of new connection, filled with the connection
  await openSettings();
  check('popup with form of new connection', await form.count() === 1 && await form.locator('.engine-option').count() === 3);
  check('DSN mode for DSN of other shape', await form.locator('.mode-switch button.active').innerText() === 'DSN' && await field('DSN').inputValue() === 'mysql://mariadb');
  check('engine selected from DSN', await form.locator('.engine-option.selected .engine-name').innerText() === 'MySQL');
  check('user and name filled in', await field('User').inputValue() === 'wrong_user' && await field('Name').inputValue() === 'Edit me');
  await page.screenshot({path: `${OUT}/connection-edit-01-popup.png`});

  // --- name of other connection
  await field('Name').fill('Other one');
  await popup.getByRole('button', {name: 'Save', exact: true}).click();
  await page.waitForTimeout(300);
  check('name of other connection refused', (await form.locator('.field-error').allInnerTexts()).includes('Connection with this name already exists') && (await stored()).displayName === 'Edit me');

  // --- test with wrong user fails, host & port mode, engine, user
  await field('Name').fill('Edited');
  await popup.getByRole('button', {name: 'Test connection'}).click();
  await page.waitForTimeout(1500);
  check('test of wrong user fails', (await form.locator('.test-result').getAttribute('class')).includes('error'), await form.locator('.test-result').innerText());
  await form.locator('.mode-switch button', {hasText: 'Host & port'}).click();
  await form.getByRole('radio', {name: /MariaDB/}).click();
  check('host mode filled from DSN', await field('Host').inputValue() === 'mariadb' && await field('Port').inputValue() === '3306'
    && await form.locator('.tls-option').count() === 4 && await form.locator('.tls-option.selected .tls-name').innerText() === 'Disabled');
  await fieldStarting('Database').fill('shop');
  await field('User').fill('flase');
  await fieldStarting('Password').fill('flase');
  await popup.getByRole('button', {name: 'Test connection'}).click();
  await page.waitForTimeout(1500);
  check('test of right user passes', (await form.locator('.test-result').innerText()).includes('Connected as'), await form.locator('.test-result').innerText());
  check('test does not connect the connection', (await established()).length === 0);
  await form.locator('.color-option[title]').nth(1).click();
  await form.locator('.option-card', {hasText: 'Read only'}).click();
  await page.screenshot({path: `${OUT}/connection-edit-02-changed.png`});

  // --- save & connect
  await popup.getByRole('button', {name: 'Save & connect'}).click();
  await page.waitForTimeout(2000);
  const saved = await stored();
  check('popup closed', await form.count() === 0);
  check('changes saved', saved.id === connection.id && saved.displayName === 'Edited' && saved.dsn === 'mariadb://mariadb:3306/shop' && saved.username === 'flase'
    && saved.readOnly === true && !!saved.color, JSON.stringify(saved));
  check('connected with new values', JSON.stringify(await established()) === JSON.stringify([connection.id]));
  check('still two connections', await page.evaluate(() => JSON.parse(localStorage.getItem('connections')).length) === 2);

  // --- connected: address and user locked, name and options can be changed
  await openSettings();
  check('address locked while connected', await form.locator('fieldset.connection-address:disabled').count() === 1 && await field('User').isDisabled()
    && (await form.locator('.locked-hint').innerText()).includes('disconnect'));
  check('no test and connect while connected', await popup.getByRole('button', {name: 'Test connection'}).count() === 0 && await popup.getByRole('button', {name: 'Save & connect'}).count() === 0);
  check('name not locked', await field('Name').isEnabled());
  await page.screenshot({path: `${OUT}/connection-edit-03-connected.png`});
  await field('Name').fill('Edited again');
  await form.locator('.option-card', {hasText: 'Read only'}).click();
  await field('Name').press('Enter');
  await page.waitForTimeout(500);
  const again = await stored();
  check('Enter saves', await form.count() === 0 && again.displayName === 'Edited again' && again.readOnly === false && again.dsn === 'mariadb://mariadb:3306/shop', JSON.stringify(again));
  check('sidebar shows new name', await page.getByText('Edited again', {exact: true}).count() === 1);

  // --- disconnect in popup unlocks the address
  await openSettings();
  await popup.getByRole('button', {name: 'Disconnect'}).click();
  await page.waitForTimeout(800);
  check('disconnect unlocks address', await form.locator('fieldset.connection-address:disabled').count() === 0 && await field('Host').isEnabled());
  await popup.getByRole('button', {name: 'Cancel'}).click();

  // --- new connection tab still works
  check('no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
