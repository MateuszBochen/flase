// UI test of remembered password (encrypted in browser): save only after successful login, connect without form,
// login again after expired session, forget, delete of connection. node ui-password.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};

(async () => {
  const connection = {id: 'ui-password', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Password test', changeConfirmationRequired: false};
  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1400, height: 900}})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://localhost:3000');
  await page.evaluate(async (connection) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    await new Promise((resolve) => { const r = indexedDB.deleteDatabase('flase-vault'); r.onsuccess = r.onerror = r.onblocked = resolve; });
  }, connection);
  await page.reload();
  await page.waitForTimeout(1500);

  /** records of vault as stored in IndexedDB (encrypted) */
  const vault = () => page.evaluate(() => new Promise((resolve) => {
    const opening = indexedDB.open('flase-vault', 1);
    opening.onupgradeneeded = () => { opening.result.createObjectStore('keys'); opening.result.createObjectStore('secrets'); };
    opening.onsuccess = () => {
      const db = opening.result;
      const all = db.transaction('secrets').objectStore('secrets').getAll();
      all.onsuccess = () => {
        const key = db.transaction('keys').objectStore('keys').get('main');
        key.onsuccess = async () => {
          let exportable = 'no key';
          if (key.result) {
            exportable = await crypto.subtle.exportKey('raw', key.result).then(() => 'exported').catch((e) => e.name);
          }
          const records = all.result.map((record) => ({
            hasIv: record.iv instanceof Uint8Array && record.iv.length === 12,
            text: new TextDecoder('latin1').decode(record.data),
          }));
          db.close();
          resolve({records, exportable, extractable: key.result ? key.result.extractable : null});
        };
      };
    };
  }));
  const established = () => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('established_connections') || '{}')).length);
  const connectIcon = () => page.locator('[title="Click to connect to database"]').first();
  const connectForm = () => page.locator('input[name="password"]');

  await page.getByText('Password test', {exact: true}).click();
  await page.waitForTimeout(300);

  // --- wrong password is not remembered
  await connectIcon().click();
  await page.waitForTimeout(300);
  await connectForm().fill('wrong');
  await page.locator('.connection-form-remember input').check();
  await page.getByRole('button', {name: 'Connect', exact: true}).click();
  await page.waitForTimeout(1500);
  check('wrong password: not connected, not remembered', await established() === 0 && (await vault()).records.length === 0);

  // --- right password remembered encrypted
  await connectForm().fill('flase');
  await page.screenshot({path: `${OUT}/password-01-form.png`});
  await page.getByRole('button', {name: 'Connect', exact: true}).click();
  await page.waitForTimeout(1500);
  const stored = await vault();
  check('connected', await established() === 1);
  check('password remembered', stored.records.length === 1 && stored.records[0].hasIv, JSON.stringify(stored.records.map((record) => record.hasIv)));
  check('stored encrypted - no password in plain text', stored.records.every((record) => !record.text.includes('flase')));
  check('key cannot be exported', stored.extractable === false && stored.exportable === 'InvalidAccessError', `${stored.extractable} ${stored.exportable}`);
  check('nothing about password in localStorage', await page.evaluate(() => !Object.values(localStorage).some((value) => /"password"/.test(value))));

  // --- disconnect, connect again without form
  await page.locator('[title^="Connection settings"]').first().click();
  await page.waitForTimeout(300);
  check('settings offer to forget password', await page.getByRole('button', {name: 'Forget saved password'}).count() === 1);
  await page.getByRole('button', {name: 'Disconnect', exact: true}).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.waitForTimeout(500);
  check('disconnected', await established() === 0);
  await connectIcon().click();
  await page.waitForTimeout(1500);
  check('remembered password: connected without form', await established() === 1 && await connectForm().count() === 0);

  // --- session expired (invalid token) - login again with remembered password
  await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('established_connections'));
    Object.values(list).forEach((item) => { item.user.token = 'expired.token.value'; });
    localStorage.setItem('established_connections', JSON.stringify(list));
  });
  await page.reload();
  await page.waitForTimeout(3000);
  const token = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('established_connections') || '{}'))[0]?.user?.token);
  check('expired session: logged in again with saved password', !!token && token !== 'expired.token.value', String(token).slice(0, 20));
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(1000);
  check('new session works', await page.getByText('shop', {exact: true}).count() > 0);

  // --- forget
  await page.locator('[title^="Connection settings"]').first().click();
  await page.waitForTimeout(300);
  await page.getByRole('button', {name: 'Forget saved password'}).click();
  await page.waitForTimeout(500);
  check('forgotten', (await vault()).records.length === 0);
  await page.getByRole('button', {name: 'Disconnect', exact: true}).click();
  await page.waitForTimeout(300);
  await page.getByRole('button', {name: 'Cancel', exact: true}).click();
  await page.waitForTimeout(300);
  await connectIcon().click();
  await page.waitForTimeout(500);
  check('without saved password the form is shown', await connectForm().count() === 1 && await connectForm().inputValue() === '');

  // --- delete of connection removes password
  await page.locator('.connection-form-remember input').check();
  await connectForm().fill('flase');
  await page.getByRole('button', {name: 'Connect', exact: true}).click();
  await page.waitForTimeout(1500);
  check('remembered again', (await vault()).records.length === 1);
  await page.locator('[title^="Connection settings"]').first().click();
  await page.waitForTimeout(300);
  // dangerous button is held, not clicked
  const deleteBox = await page.getByRole('button', {name: 'Hold to delete connection'}).boundingBox();
  await page.mouse.move(deleteBox.x + deleteBox.width / 2, deleteBox.y + deleteBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1500);
  await page.mouse.up();
  await page.waitForTimeout(800);
  check('connection deleted', await page.getByText('Password test', {exact: true}).count() === 0);
  check('deleted connection - password removed', (await vault()).records.length === 0);

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
