// Smoke test of production image: application, API and websocket on one address. node ui-image.js <url of container>
// started by `tests/run.sh image` (container with FLASE_CONNECTIONS pointing to test MariaDB)
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const BASE = process.argv[2] || 'http://localhost:3005';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1400, height: 900}})).newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (request) => requests.push(request.url()));
  page.on('websocket', (ws) => requests.push(ws.url()));

  await page.goto(BASE);
  await page.waitForTimeout(2000);
  check('application served by server', await page.locator('.cmp-welcome').count() === 1);
  check('predefined connection from configuration', await page.getByText('Maria image', {exact: true}).count() === 1);

  await page.getByText('Maria image', {exact: true}).click();
  await page.waitForTimeout(300);
  await page.locator('[title="Click to connect to database"]').first().click();
  await page.waitForTimeout(300);
  await page.locator('input[name="password"]').fill('flase');
  await page.getByRole('button', {name: 'Connect', exact: true}).click();
  await page.waitForTimeout(1500);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(1000);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(1000);
  await page.getByText('customers', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForFunction(() => document.querySelectorAll('.data-table-row').length > 10, null, {timeout: 15000}).catch(() => {});
  check('rows of table over websocket', await page.locator('.data-table-row').count() > 10, String(await page.locator('.data-table-row').count()));
  await page.screenshot({path: `${OUT}/image-01-table.png`});

  const origin = new URL(BASE);
  const foreign = requests.filter((url) => {
    const parsed = new URL(url);
    // editor is loaded from CDN
    return parsed.host !== origin.host && !/jsdelivr|fonts\.(googleapis|gstatic)/.test(parsed.host);
  });
  check('API and websocket on the same address', foreign.length === 0 && requests.some((url) => url.startsWith(origin.origin.replace(/^http/, 'ws') + '/ws/')),
    JSON.stringify(foreign.slice(0, 5)));
  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300));

  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
