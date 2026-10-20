// Moving of tabs: drag as in browser (others make room), Alt+Shift+arrows; content of tab is kept, order restored after reload
// node ui-tab-drag.js
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};

(async () => {
  const connection = {id: 'ui-tab-drag', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Tab drag', changeConfirmationRequired: false};
  const user = await (await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();

  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1400, height: 900}})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
  }, [connection, user]);
  await page.reload();
  await page.waitForTimeout(1500);

  const tabs = page.locator('.tab-label-list-item');
  const tabLabels = () => tabs.allInnerTexts().then((texts) => texts.map((text) => text.split('\n')[0].trim()));
  const activeTab = () => page.locator('.tab-label-list-item.active').innerText().then((text) => text.split('\n')[0].trim());
  /** drags tab by mouse to x of middle of other tab, pause - shot while dragged */
  const dragTab = async (from, to, shot) => {
    const source = await tabs.nth(from).boundingBox();
    const target = await tabs.nth(to).boundingBox();
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
    await page.mouse.down();
    const x = target.x + target.width / 2 + (to > from ? 10 : -10);
    await page.mouse.move(x, source.y + source.height / 2, {steps: 12});
    await page.waitForTimeout(300);
    if (shot) await page.screenshot({path: `${OUT}/${shot}`, clip: {x: 0, y: 0, width: 1400, height: 120}});
    const dragged = await page.locator('.tab-label-list-item.dragged').count();
    await page.mouse.up();
    await page.waitForTimeout(400);
    return dragged;
  };

  await page.getByText('Tab drag', {exact: true}).click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(800);
  await page.getByText('customers', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  for (const table of ['orders', 'products']) {
    await page.getByText(table, {exact: true}).first().click({button: 'middle'});
    await page.waitForTimeout(1200);
  }
  check('three tabs', JSON.stringify(await tabLabels()) === JSON.stringify(['shop/customers', 'shop/orders', 'shop/products']), JSON.stringify(await tabLabels()));

  // text in query of customers - kept when its tab is moved
  await tabs.nth(0).click();
  await page.waitForTimeout(600);
  const editor = page.locator('.table-records-root:visible .monaco-editor').first();
  await editor.click();
  await page.keyboard.press('End');
  await page.keyboard.type(' -- kept', {delay: 5});
  await page.waitForTimeout(300);

  // --- click without move only switches tab
  await tabs.nth(1).click();
  await page.waitForTimeout(400);
  check('click does not move tab', JSON.stringify(await tabLabels()) === JSON.stringify(['shop/customers', 'shop/orders', 'shop/products']) && await activeTab() === 'shop/orders');

  // --- drag first tab to the end
  await tabs.nth(0).click();
  await page.waitForTimeout(300);
  const dragged = await dragTab(0, 2, 'tab-drag-01-dragging.png');
  check('tab is marked while dragged', dragged === 1);
  check('tab dragged to the end', JSON.stringify(await tabLabels()) === JSON.stringify(['shop/orders', 'shop/products', 'shop/customers']), JSON.stringify(await tabLabels()));
  check('dragged tab stays active', await activeTab() === 'shop/customers', await activeTab());
  check('content of moved tab kept', /--\s*kept/.test(await editor.innerText()), await editor.innerText());
  check('no tab shifted after drop', await page.locator('.tab-label-list-item[style*="translateX"]').count() === 0);

  // --- drag to the left, other tab is active
  await dragTab(1, 0);
  check('tab dragged to the start', JSON.stringify(await tabLabels()) === JSON.stringify(['shop/products', 'shop/orders', 'shop/customers']), JSON.stringify(await tabLabels()));
  check('dragged tab becomes active', await activeTab() === 'shop/products', await activeTab());
  check('its content is shown', (await page.locator('.table-records-root:visible .monaco-editor').first().innerText()).includes('products'));

  // --- Alt+Shift+arrows
  await page.locator('.table-records-root:visible .data-table-row').first().click();
  await page.keyboard.press('Alt+Shift+ArrowRight');
  await page.waitForTimeout(300);
  check('Alt+Shift+→ moves tab right', JSON.stringify(await tabLabels()) === JSON.stringify(['shop/orders', 'shop/products', 'shop/customers']) && await activeTab() === 'shop/products', JSON.stringify(await tabLabels()));
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  await page.keyboard.press('Alt+Shift+ArrowLeft');
  await page.waitForTimeout(300);
  check('Alt+Shift+← moves tab left, not before first', JSON.stringify(await tabLabels()) === JSON.stringify(['shop/products', 'shop/orders', 'shop/customers']), JSON.stringify(await tabLabels()));

  // --- closing after move closes the right tab, Alt+digit goes to new places
  await page.keyboard.press('Alt+3');
  await page.waitForTimeout(300);
  check('Alt+3 goes to tab at new place', await activeTab() === 'shop/customers', await activeTab());

  // --- order restored after reload
  await page.reload();
  await page.waitForTimeout(3000);
  check('order restored after reload', JSON.stringify(await tabLabels()) === JSON.stringify(['shop/products', 'shop/orders', 'shop/customers']), JSON.stringify(await tabLabels()));
  check('active tab restored', await activeTab() === 'shop/customers', await activeTab());

  await tabs.nth(1).locator('.close-tab').dispatchEvent('mousedown', {button: 0});
  await page.waitForTimeout(400);
  check('close after move closes the right tab', JSON.stringify(await tabLabels()) === JSON.stringify(['shop/products', 'shop/customers']), JSON.stringify(await tabLabels()));

  check('no page errors', errors.length === 0, errors.join('; '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})();
