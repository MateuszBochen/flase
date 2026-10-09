// Render performance of grid with many columns (wide_test: 50 columns, 1000 rows). node ui-perf.js [mysql|postgres]
// Prints times and CDP metrics (script / layout / style) of opening table, scrolling, selecting and editing.
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';
const engine = process.argv[2] || 'mysql';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`);
};

(async () => {
  const connection = engine === 'postgres'
    ? {id: 'perf', dsn: 'postgresql://postgres:5432/shop', username: 'flase', displayName: 'Perf', changeConfirmationRequired: false}
    : {id: 'perf', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Perf', changeConfirmationRequired: false};
  const res = await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})});
  const user = await res.json();

  const browser = await chromium.launch();
  const context = await browser.newContext({viewport: {width: 1920, height: 1080}});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');

  const metrics = async () => {
    const {metrics} = await cdp.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    return {script: m.ScriptDuration * 1000, layout: m.LayoutDuration * 1000, style: m.RecalcStyleDuration * 1000, task: m.TaskDuration * 1000, nodes: m.Nodes};
  };
  /** runs action, waits until page is idle (2 frames without long work) and prints cost */
  const measure = async (name, action) => {
    const before = await metrics();
    const start = Date.now();
    await action();
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const wall = Date.now() - start;
    const after = await metrics();
    const result = {wall, script: after.script - before.script, layout: after.layout - before.layout, style: after.style - before.style, task: after.task - before.task, nodes: after.nodes};
    console.log(`TIME  ${name.padEnd(28)} wall ${String(wall).padStart(5)} ms | task ${result.task.toFixed(0).padStart(5)} | script ${result.script.toFixed(0).padStart(5)} | layout ${result.layout.toFixed(0).padStart(4)} | style ${result.style.toFixed(0).padStart(4)} | nodes ${after.nodes}`);
    return result;
  };

  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
  }, [connection, user]);
  await page.reload();
  await page.waitForTimeout(1500);
  await page.getByText('Perf', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.getByText(engine === 'postgres' ? 'public' : 'shop', {exact: true}).first().click();
  await page.waitForTimeout(800);

  const rowsLoaded = () => page.waitForFunction(() => document.querySelectorAll('.data-table-row').length > 20
    && /Records:\s*0 - 100/.test(document.querySelector('.cmp-records-view-pager')?.textContent || ''), null, {timeout: 20000});

  const open = await measure('open wide_test (100 rows)', async () => {
    await page.getByText('wide_test', {exact: true}).first().click();
    await rowsLoaded();
  });
  const cells = await page.locator('.data-table-cell').count();
  console.log(`INFO  rendered rows ${await page.locator('.data-table-row').count()}, cells ${cells}`);
  check('rows rendered', cells > 1000, `${cells} cells`);
  await page.screenshot({path: `${OUT}/perf-01-open.png`});

  const grid = page.locator('.data-table-content').first();
  const box = await grid.boundingBox();
  await page.mouse.move(box.x + 200, box.y + 100);
  const scroll = await measure('scroll 20 wheel steps', async () => {
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, 60);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
    }
  });
  const firstId = await page.locator('.data-table-row').first().locator('.data-table-cell').first().textContent();
  check('scrolled', firstId !== '1', `first id ${firstId}`);

  const click = await measure('click cell', async () => {
    await page.mouse.click(box.x + 300, box.y + 60);
  });
  const drag = await measure('drag selection 10x10', async () => {
    await page.mouse.move(box.x + 100, box.y + 40);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(box.x + 100 + i * 120, box.y + 40 + i * 21);
    }
    await page.mouse.up();
  });
  check('selection made', await page.locator('.data-table-cell.cell-selected').count() > 20);

  const edit = await measure('double click - edit cell', async () => {
    await page.mouse.dblclick(box.x + 300, box.y + 60);
    await page.locator('.data-table-cell.editing input, .data-table-cell.editing textarea').first().waitFor({timeout: 3000});
  });
  await measure('type 10 chars into editor', async () => {
    await page.keyboard.type('abcdefghij');
  });
  await page.keyboard.press('Escape');

  await measure('horizontal scroll to end', async () => {
    await page.locator('.cmp-data-grid').first().evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await page.waitForTimeout(100);
  });
  await page.screenshot({path: `${OUT}/perf-02-end.png`});
  // only visible columns are rendered - the last ones must be there after scroll
  const visible = await page.evaluate(() => {
    const grid = document.querySelector('.cmp-data-grid').getBoundingClientRect();
    const cells = [...document.querySelector('.data-table-row').querySelectorAll('.data-table-cell')];
    const last = cells[cells.length - 1].getBoundingClientRect();
    return {count: cells.length, lastText: cells[cells.length - 1].textContent, lastInside: last.left < grid.right && last.right > grid.left};
  });
  check('last column rendered after horizontal scroll', visible.lastInside && /longer text of column 49/.test(visible.lastText), JSON.stringify(visible));
  check('not all columns rendered', visible.count < 50, `${visible.count} cells in row`);

  check('no page errors', errors.length === 0, errors.join(' | '));
  console.log(`SUMMARY open ${open.wall} ms, scroll ${scroll.task.toFixed(0)} ms task, click ${click.task.toFixed(0)} ms, drag ${drag.task.toFixed(0)} ms, edit ${edit.task.toFixed(0)} ms`);
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})();
