// Query timing when the browser tab is hidden: animation frames do not run there (until the user comes back), so
// render must end with the commit of rows - it was measured until the return of the user (render of hours).
// node ui-timing-hidden.js
const {chromium} = require('playwright');

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};

const login = async (connection) => (await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();

/** milliseconds of a step of the timing panel ("Render", "Query") */
const msOf = (text, step) => {
  const match = new RegExp(`${step}\\s*([\\d.]+) (ms|s)`).exec(text);
  return match ? Number(match[1]) * (match[2] === 's' ? 1000 : 1) : null;
};

(async () => {
  const maria = {id: 'timing-maria', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Timing Maria', changeConfirmationRequired: false};
  const user = await login(maria);
  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1400, height: 800}})).newPage();
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
  }, [maria, user]);
  await page.reload();
  await page.getByText('Timing Maria', {exact: true}).first().click();
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.getByText('shop', {exact: true}).first().click();
  await page.getByText('orders', {exact: true}).first().waitFor();
  const panel = () => page.locator('.query-timing-panel').last().evaluate((element) => element.textContent);

  // visible page - render ends after paint (animation frames)
  await page.getByText('orders', {exact: true}).first().click();
  await page.waitForFunction(() => /Fetch 100 row\(s\)/.test(document.querySelector('.query-timing-panel')?.textContent || ''));
  const visible = await panel();
  check('visible page: timing measured', msOf(visible, 'Render') !== null && msOf(visible, 'Render') < 5000, visible);

  // hidden page: browser runs no animation frames until the user comes back
  await page.evaluate(() => {
    window.originalRaf = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
    Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByText('categories', {exact: true}).first().click();
  // timing must come without any animation frame
  const measured = await page.waitForFunction(() => /Fetch 5 row\(s\)/.test(document.querySelector('.query-timing-panel')?.textContent || ''), null, {timeout: 10000}).then(() => true, () => false);
  const hidden = await panel();
  check('hidden page: timing measured without animation frames', measured, hidden);
  check('hidden page: render is not the time until return of the user', measured && msOf(hidden, 'Render') < 2000, hidden);

  // the user comes back - next queries are measured to the paint again
  await page.evaluate(() => {
    window.requestAnimationFrame = window.originalRaf;
    delete document.hidden;
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByText('orders', {exact: true}).first().click();
  await page.waitForFunction(() => /Fetch 100 row\(s\)/.test(document.querySelector('.query-timing-panel')?.textContent || ''));
  check('visible again: timing measured', msOf(await panel(), 'Render') < 5000, await panel());

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})();
