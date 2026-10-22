// SSH tunnel in UI: new connection with tunnel (test, trust host key, save & connect), data through tunnel,
// connect from sidebar with SSH password, changed host key prompt, key file of server, settings of tunnel in edit popup
// node ui-ssh.js   (flase_ssh is the bastion - MariaDB only on its 127.0.0.1:13307)
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1400, height: 1000}})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:3000');
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise((resolve) => { const r = indexedDB.deleteDatabase('flase-vault'); r.onsuccess = r.onerror = r.onblocked = resolve; });
  });
  await page.reload();
  await page.waitForTimeout(1500);

  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('connections') || '[]')[0]);
  const established = () => page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('established_connections') || '{}')).length);
  const field = (root, label) => root.locator('label.field', {has: page.locator('span', {hasText: new RegExp(`^${label}`)})}).locator('input');
  const hold = async (locator) => {
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(1500);
    await page.mouse.up();
    await page.waitForTimeout(1500);
  };

  // --- new connection with tunnel
  // second icon of main menu opens the form
  await page.locator('.buttons-bar svg').nth(1).click();
  await page.waitForTimeout(500);
  const form = page.locator('.cmp-new-connection:visible');
  await form.getByRole('radio', {name: /MariaDB/}).click();
  await field(form, 'Host').fill('127.0.0.1');
  await field(form, 'Port').first().fill('13307');
  await field(form, 'Database').fill('shop');
  await field(form, 'User').fill('flase');
  await field(form, 'Password').fill('flase');
  await field(form, 'Name').fill('Behind bastion');
  await form.getByText('Connect through SSH server').click();
  check('SSH fields shown', await field(form, 'SSH host').count() === 1 && await form.locator('.ssh-auth-options .tls-option').count() === 3);
  await form.getByRole('button', {name: 'Test connection'}).click();
  await page.waitForTimeout(500);
  check('SSH host and user required', (await form.locator('.field-error').allInnerTexts()).join('|').includes('SSH host is required'));
  await field(form, 'SSH host').fill('ssh');
  await field(form, 'SSH user').fill('tunnel');
  await field(form, 'SSH password').fill('tunnel');
  await form.getByRole('button', {name: 'Test connection'}).click();
  await page.waitForTimeout(2500);
  const result = form.locator('.test-result');
  check('test shows unknown host key', (await result.innerText()).includes('not known yet: SHA256:') && await result.getByRole('button', {name: 'Trust this key'}).count() === 1, await result.innerText());
  await page.screenshot({path: `${OUT}/ssh-01-unknown-key.png`});
  await result.getByRole('button', {name: 'Trust this key'}).click();
  await page.waitForTimeout(2500);
  check('trusted key: test passes through tunnel', (await result.innerText()).includes('Connected as flase through SSH ssh'), await result.innerText());
  const hostKey = await field(form, 'Host key').inputValue();
  check('host key filled in', /^SHA256:/.test(hostKey), hostKey);
  await page.screenshot({path: `${OUT}/ssh-02-form.png`, fullPage: true});
  await form.getByRole('button', {name: 'Save & connect'}).click();
  await page.waitForTimeout(2500);
  const saved = await stored();
  check('saved with tunnel, without secrets', saved?.ssh?.host === 'ssh' && saved.ssh.username === 'tunnel' && saved.ssh.auth === 'password' && saved.ssh.hostKey === hostKey
    && saved.dsn === 'mariadb://127.0.0.1:13307/shop' && !/"password":/.test(JSON.stringify(saved)), JSON.stringify(saved));
  check('connected', await established() === 1);

  // --- data through tunnel
  await page.getByText('Behind bastion', {exact: true}).click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(1200);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(1200);
  await page.getByText('customers', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(2500);
  const rows = await page.locator('.table-records-root:visible .data-table-row').count();
  check('table data through tunnel', rows > 10, rows);

  // --- disconnect, connect from sidebar - SSH password asked
  await page.locator('[title^="Connection settings"]').first().click();
  await page.waitForTimeout(400);
  const popup = page.locator('.popup-content');
  check('edit popup shows tunnel, locked while connected', await popup.locator('fieldset.connection-address:disabled').count() === 1
    && await field(popup, 'SSH host').inputValue() === 'ssh' && await field(popup, 'Host key').inputValue() === hostKey);
  await popup.getByRole('button', {name: 'Disconnect'}).click();
  await page.waitForTimeout(800);
  await popup.getByRole('button', {name: 'Cancel'}).click();
  await page.waitForTimeout(400);
  await page.locator('[title="Click to connect to database"]').first().click();
  await page.waitForTimeout(400);
  const connectForm = page.locator('.connection-form-ssh');
  check('connect form asks SSH password', (await connectForm.innerText()).includes('tunnel@ssh') && await page.locator('input[name="sshPassword"]').count() === 1);
  await page.locator('input[name="password"]').fill('flase');
  await page.locator('input[name="sshPassword"]').fill('tunnel');
  await page.locator('.connection-form-remember input').check();
  await page.screenshot({path: `${OUT}/ssh-03-connect.png`});
  await page.getByRole('button', {name: 'Connect', exact: true}).click();
  await page.waitForTimeout(2500);
  check('connected from sidebar through tunnel', await established() === 1);

  // --- host key changed (e.g. reinstalled bastion) - prompt, hold to trust
  await page.evaluate(() => {
    const connections = JSON.parse(localStorage.getItem('connections'));
    connections[0].ssh.hostKey = 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    localStorage.setItem('connections', JSON.stringify(connections));
    localStorage.removeItem('established_connections');
  });
  await page.reload();
  await page.waitForTimeout(2000);
  // open servers are restored after reload
  if (!await page.locator('[title="Click to connect to database"]').first().isVisible()) {
    await page.getByText('Behind bastion', {exact: true}).click();
    await page.waitForTimeout(300);
  }
  // remembered passwords (also SSH) - login starts at once
  await page.locator('[title="Click to connect to database"]').first().click();
  await page.waitForTimeout(2500);
  const prompt = page.locator('.cmp-ssh-host-key');
  check('changed host key prompt', await prompt.count() === 1 && (await page.locator('.popup-name', {hasText: 'has changed'}).count()) === 1
    && (await prompt.innerText()).includes(hostKey) && await established() === 0, await prompt.innerText().catch(() => ''));
  await page.screenshot({path: `${OUT}/ssh-04-changed-key.png`});
  await hold(page.getByRole('button', {name: 'Hold to trust new key and connect'}));
  check('new key trusted and connected', (await stored()).ssh.hostKey === hostKey && await established() === 1, JSON.stringify((await stored()).ssh));

  // --- key file of server instead of password
  await page.locator('[title^="Connection settings"]').first().click();
  await page.waitForTimeout(400);
  await popup.getByRole('button', {name: 'Disconnect'}).click();
  await page.waitForTimeout(800);
  await popup.getByRole('button', {name: 'Forget saved password'}).click();
  await page.waitForTimeout(500);
  await popup.getByRole('radio', {name: /Key on Flase server/}).click();
  await field(popup, 'Key file on Flase server').fill('ssh-test-key');
  await field(popup, 'Password').fill('flase');
  await popup.getByRole('button', {name: 'Test connection'}).click();
  await page.waitForTimeout(2500);
  check('test with key file of server', (await popup.locator('.test-result').innerText()).includes('through SSH'), await popup.locator('.test-result').innerText());
  await popup.getByRole('button', {name: 'Save', exact: true}).click();
  await page.waitForTimeout(500);
  check('key file saved', (await stored()).ssh.auth === 'keyFile' && (await stored()).ssh.keyFile === 'ssh-test-key');
  await page.locator('[title="Click to connect to database"]').first().click();
  await page.waitForTimeout(800);
  check('connect form: key file, passphrase asked, no SSH password', (await page.locator('.connection-form-ssh').innerText()).includes('ssh-test-key')
    && await page.locator('input[name="sshPassword"]').count() === 0 && await page.locator('input[name="sshPassphrase"]').count() === 1);
  await page.locator('input[name="password"]').fill('flase');
  await page.getByRole('button', {name: 'Connect', exact: true}).click();
  await page.waitForTimeout(2500);
  check('connected with key file', await established() === 1);

  // --- tunnel turned off: DSN of bastion loopback is not reachable
  await page.locator('[title^="Connection settings"]').first().click();
  await page.waitForTimeout(400);
  await popup.getByRole('button', {name: 'Disconnect'}).click();
  await page.waitForTimeout(800);
  await popup.getByText('Connect through SSH server').click();
  await popup.getByRole('button', {name: 'Test connection'}).click();
  await page.waitForTimeout(2500);
  check('without tunnel database is not reachable', (await popup.locator('.test-result').innerText()).includes('refused'), await popup.locator('.test-result').innerText());
  await popup.getByRole('button', {name: 'Cancel'}).click();

  check('no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
