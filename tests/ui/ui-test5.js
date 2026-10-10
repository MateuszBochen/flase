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
  const measure = () => page.evaluate(() => {
    const cell = document.querySelectorAll('.cmp-records-view .data-table-row')[1].querySelectorAll('.data-table-cell')[1];
    const scrolled = [];
    for (let el = cell; el; el = el.parentElement) {
      if (el.scrollTop || el.scrollLeft) scrolled.push(`${el.className.split(' ')[0]}: top=${el.scrollTop} left=${el.scrollLeft}`);
    }
    const content = cell.querySelector('.data-table-cell-content');
    return {
      offset: content.getBoundingClientRect().top - cell.getBoundingClientRect().top,
      cellHeight: cell.getBoundingClientRect().height,
      contentHeight: content.getBoundingClientRect().height,
      scrolled,
    };
  });
  const before = await measure();
  console.log('before', JSON.stringify(before));
  const cell = rows.nth(1).locator('.data-table-cell').nth(1);
  await cell.dblclick();
  console.log('editing', JSON.stringify(await measure()));
  await grid.locator('.cell-editor-input').fill('zz');
  await grid.locator('.cell-editor-input').press('Enter');
  await page.waitForTimeout(200);
  const after = await measure();
  console.log('after', JSON.stringify(after));
  await cell.screenshot({path: `${OUT}/41-cell.png`});
  check('content not shifted after edit', after.offset === before.offset && after.scrolled.length === 0, JSON.stringify(after));

  // submit and measure again
  await grid.getByRole('button', {name: 'Submit'}).click();
  await page.waitForTimeout(1200);
  const saved = await measure();
  console.log('saved', JSON.stringify(saved));
  check('content not shifted after save', saved.offset === before.offset && saved.scrolled.length === 0, JSON.stringify(saved));
  await rows.nth(0).screenshot({path: `${OUT}/42-rows.png`});

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
