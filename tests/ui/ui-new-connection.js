// UI test of new connection form: engine, host / port / database or DSN, test connection, save, save & connect
// node ui-new-connection.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1400, height: 1000}})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/401|Unauthorized/.test(m.text())) errors.push(m.text()); });

  await page.goto('http://localhost:3000');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForTimeout(1500);

  // second icon of main menu opens the form
  await page.locator('.buttons-bar svg').nth(1).click();
  await page.waitForTimeout(500);
  const form = page.locator('.cmp-new-connection:visible');
  check('form opened', await form.count() === 1);
  await page.screenshot({path: `${OUT}/new-connection-01-dark.png`});

  const field = (label) => form.locator('.field').filter({has: page.locator(`span:text-is("${label}")`)}).locator('input');
  const fieldStarting = (label) => form.locator('.field').filter({has: page.locator('span', {hasText: new RegExp(`^${label}`)})}).locator('input').first();
  const preview = () => form.locator('.dsn-preview').innerText();
  const status = () => form.locator('.test-result').innerText();

  // --- engine sets default port, preview of DSN
  check('default mysql', await fieldStarting('Port').inputValue() === '3306' && await preview() === 'mysql://localhost:3306', await preview());
  await form.getByRole('radio', {name: /PostgreSQL/}).click();
  check('postgres default port', await fieldStarting('Port').inputValue() === '5432' && await preview() === 'postgresql://localhost:5432', await preview());
  await fieldStarting('Port').fill('6543');
  await form.getByRole('radio', {name: /MariaDB/}).click();
  check('port typed by user is kept', await fieldStarting('Port').inputValue() === '6543');
  await fieldStarting('Port').fill('');
  await form.getByRole('radio', {name: /MySQL/}).click();
  check('empty port gets default', await fieldStarting('Port').inputValue() === '3306');

  // --- validation
  await form.getByRole('button', {name: 'Save', exact: true}).click();
  await page.waitForTimeout(200);
  check('user is required', (await form.locator('.field-error').allInnerTexts()).includes('User is required'), JSON.stringify(await form.locator('.field-error').allInnerTexts()));

  // --- DSN mode: pasted DSN fills fields
  await form.getByRole('button', {name: 'DSN', exact: true}).click();
  await fieldStarting('DSN').fill('postgresql://postgres:5432/shop');
  await form.getByRole('button', {name: /Host/}).click();
  check('DSN parsed into fields', await fieldStarting('Host').inputValue() === 'postgres' && await fieldStarting('Port').inputValue() === '5432'
    && await fieldStarting('Database').inputValue() === 'shop' && await form.getByRole('radio', {name: /PostgreSQL/}).getAttribute('aria-checked') === 'true');
  check('suggested name from host and database', await fieldStarting('Name').getAttribute('placeholder') === 'postgres · shop');
  await form.getByRole('button', {name: 'DSN', exact: true}).click();
  await fieldStarting('DSN').fill('ftp://x');
  await form.getByRole('button', {name: 'Save', exact: true}).click();
  await page.waitForTimeout(200);
  check('invalid DSN reported', (await form.locator('.field-error').allInnerTexts()).some((text) => /Expected e\.g\./.test(text)));
  await fieldStarting('DSN').fill('postgresql://postgres:5432/shop');
  await form.getByRole('button', {name: /Host/}).click();

  // --- test connection: wrong password, right password
  await fieldStarting('User').fill('flase');
  await fieldStarting('Password').fill('wrong');
  await form.getByRole('button', {name: 'Test connection'}).click();
  await page.waitForFunction(() => /error/.test(document.querySelector('.cmp-new-connection .test-result')?.className || ''), null, {timeout: 10000});
  check('test with wrong password fails', /password|authentication/i.test(await status()), await status());
  await fieldStarting('Password').fill('flase');
  await form.getByRole('button', {name: 'Test connection'}).click();
  await page.waitForFunction(() => /\bok\b/.test(document.querySelector('.cmp-new-connection .test-result')?.className || ''), null, {timeout: 10000});
  check('test with right password', /Connected as flase/.test(await status()), await status());
  check('test does not save connection', await page.evaluate(() => JSON.parse(localStorage.getItem('connections') || '[]').length) === 0);

  // --- options, color, save & connect
  await fieldStarting('Name').fill('PG shop');
  await form.getByRole('button', {name: 'Red (production)'}).click();
  await form.locator('.option-card').filter({hasText: 'Read only'}).click();
  await page.screenshot({path: `${OUT}/new-connection-02-filled.png`});
  await form.getByRole('button', {name: 'Save & connect'}).click();
  await page.waitForTimeout(2500);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('connections') || '[]'));
  check('connection saved', saved.length === 1 && saved[0].displayName === 'PG shop' && saved[0].dsn === 'postgresql://postgres:5432/shop'
    && saved[0].username === 'flase' && saved[0].readOnly === true && saved[0].color === '#d9534f' && !('password' in saved[0]), JSON.stringify(saved));
  check('connection in sidebar', await page.getByText('PG shop', {exact: true}).count() === 1);
  check('connected', await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('established_connections') || '{}')).length) === 1);
  check('form reset for next connection', await fieldStarting('Name').inputValue() === '' && await fieldStarting('Password').inputValue() === '');

  // --- save without connect, duplicate name refused
  await fieldStarting('Host').fill('mariadb');
  await form.getByRole('radio', {name: /MariaDB/}).click();
  await fieldStarting('Database').fill('');
  await fieldStarting('User').fill('flase');
  await fieldStarting('Name').fill('PG shop');
  await form.getByRole('button', {name: 'Save', exact: true}).click();
  await page.waitForTimeout(300);
  check('duplicate name refused', (await form.locator('.field-error').allInnerTexts()).some((text) => /already exists/.test(text))
    && (await page.evaluate(() => JSON.parse(localStorage.getItem('connections') || '[]').length)) === 1);
  await fieldStarting('Name').fill('');
  await form.getByRole('button', {name: 'Save', exact: true}).click();
  await page.waitForTimeout(500);
  const second = await page.evaluate(() => JSON.parse(localStorage.getItem('connections') || '[]')[1]);
  check('saved with suggested name, not connected', second?.displayName === 'mariadb' && second?.dsn === 'mariadb://mariadb:6543'.replace('6543', '3306')
    && (await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('established_connections') || '{}')).length)) === 1, JSON.stringify(second));

  // --- light theme screenshot
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await page.waitForTimeout(300);
  await page.screenshot({path: `${OUT}/new-connection-03-light.png`});

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
