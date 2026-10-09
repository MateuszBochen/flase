// UI test of servers in sidebar: every server is opened / closed by user, more can be open, state is remembered
// node ui-sidebar.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};

(async () => {
  const connections = [
    {id: 'side-maria', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Maria side', changeConfirmationRequired: false},
    {id: 'side-pg', dsn: 'postgresql://postgres:5432/shop', username: 'flase', displayName: 'PG side', changeConfirmationRequired: false},
  ];
  const established = {};
  for (const connection of connections) {
    const res = await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})});
    established[connection.id] = {user: await res.json(), connection};
  }

  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1400, height: 900}})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://localhost:3000');
  await page.evaluate(([connections, established]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify(connections));
    localStorage.setItem('established_connections', JSON.stringify(established));
  }, [connections, established]);
  await page.reload();
  await page.waitForTimeout(1500);

  const openServers = () => page.evaluate(() => [...document.querySelectorAll('.connection-list-root li.vertical-slider-item, li.vertical-slider-item')]
    .filter((item) => !item.parentElement.closest('li.vertical-slider-item'))
    .filter((item) => item.classList.contains('active'))
    .map((item) => item.querySelector(':scope > .vertical-slider-label').textContent));
  const server = (name) => page.getByText(name, {exact: true}).first();

  check('nothing open at start', (await openServers()).length === 0, JSON.stringify(await openServers()));
  await server('Maria side').click();
  await page.waitForTimeout(300);
  await server('PG side').click();
  await page.waitForTimeout(300);
  check('opening second server keeps first open', JSON.stringify(await openServers()) === '["Maria side","PG side"]', JSON.stringify(await openServers()));

  // clicks inside opened server (load databases, open database) do not close it
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(800);
  check('click in content keeps server open', JSON.stringify(await openServers()) === '["Maria side","PG side"]' && await page.getByText('customers', {exact: true}).count() > 0,
    JSON.stringify(await openServers()));
  await page.screenshot({path: `${OUT}/sidebar-01-both-open.png`});

  await server('Maria side').click();
  await page.waitForTimeout(300);
  check('click on open server closes only it', JSON.stringify(await openServers()) === '["PG side"]', JSON.stringify(await openServers()));

  await page.reload();
  await page.waitForTimeout(1500);
  check('open servers remembered after reload', JSON.stringify(await openServers()) === '["PG side"]', JSON.stringify(await openServers()));

  // renamed connection keeps open state (state is kept by id)
  await page.evaluate(() => {
    const list = JSON.parse(localStorage.getItem('connections'));
    list[1].displayName = 'PG renamed';
    localStorage.setItem('connections', JSON.stringify(list));
  });
  await page.reload();
  await page.waitForTimeout(1500);
  check('state kept by id, not by name', JSON.stringify(await openServers()) === '["PG renamed"]', JSON.stringify(await openServers()));

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
