// Comparison of row rendering of Flase and phpMyAdmin (results are in README.md, "Performance" section).
//   node bench-phpmyadmin.js http://localhost:3010 http://localhost:8090 [runs]
// Both tools are connected to the same MariaDB (user flase / flase, database shop, table wide_test: 50 columns, 1000 rows).
// phpMyAdmin must show 100 rows per page ($cfg['MaxRows'] = 100) - the same as Flase.
// Every run is a new browser context; the first run of each scenario warms up the caches and is not counted.
// Measured: time from click to rendered rows, CPU time of the page (CDP task / script / layout / style),
// DOM elements, JS heap after GC, bytes received and CPU time of 20 wheel scroll steps.
const {chromium} = require('playwright');

const FLASE = process.argv[2] || 'http://localhost:3010';
const PMA = process.argv[3] || 'http://localhost:8090';
const RUNS = Number(process.argv[4] || 5);
const SQL = 'SELECT * FROM wide_test LIMIT 1000';

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const frames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function session(browser) {
  const context = await browser.newContext({viewport: {width: 1920, height: 1080}});
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Network.enable');
  let bytes = 0;
  cdp.on('Network.loadingFinished', (event) => { bytes += event.encodedDataLength; });
  cdp.on('Network.webSocketFrameReceived', (event) => { bytes += event.response.payloadData.length; });
  const metrics = async () => {
    const {metrics} = await cdp.send('Performance.getMetrics');
    const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
    return {task: m.TaskDuration * 1000, script: m.ScriptDuration * 1000, layout: m.LayoutDuration * 1000, style: m.RecalcStyleDuration * 1000};
  };
  /** runs action (it waits for rendered rows), then measures state of the page */
  const measure = async (action) => {
    const before = await metrics();
    bytes = 0;
    const start = performance.now();
    await action();
    await frames(page);
    const wall = performance.now() - start;
    const after = await metrics();
    const received = bytes;
    await cdp.send('HeapProfiler.collectGarbage');
    const {usedSize} = await cdp.send('Runtime.getHeapUsage');
    const elements = await page.evaluate(() => document.getElementsByTagName('*').length);
    return {
      wall, task: after.task - before.task, script: after.script - before.script, layout: after.layout - before.layout,
      style: after.style - before.style, elements, heap: usedSize / 1048576, kb: received / 1024,
    };
  };
  /** CPU time of 20 wheel steps over element */
  const scroll = async (selector) => {
    const box = await page.locator(selector).first().boundingBox();
    await page.mouse.move(box.x + 300, box.y + Math.min(300, box.height / 2));
    const before = await metrics();
    const start = performance.now();
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, 120);
      await frames(page);
    }
    const after = await metrics();
    return {scrollWall: performance.now() - start, scrollTask: after.task - before.task};
  };
  return {context, page, measure, scroll};
}

// --- Flase
async function flaseSession(browser) {
  const s = await session(browser);
  const connection = {id: 'bench', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Bench', changeConfirmationRequired: false};
  const res = await fetch(`${FLASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})});
  const user = await res.json();
  await s.page.goto(FLASE);
  await s.page.evaluate(([connection, user]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
  }, [connection, user]);
  await s.page.reload();
  await s.page.getByText('Bench', {exact: true}).first().click();
  await s.page.locator('button[title="Load database list"]').first().waitFor();
  await s.page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await s.page.getByText('shop', {exact: true}).first().click();
  await s.page.getByText('wide_test', {exact: true}).first().waitFor();
  await s.page.waitForTimeout(500);
  return s;
}

async function flaseBrowse(browser) {
  const s = await flaseSession(browser);
  const result = await s.measure(async () => {
    await s.page.getByText('wide_test', {exact: true}).first().click();
    await s.page.waitForFunction(() => document.querySelectorAll('.data-table-row').length > 20
      && /Records:\s*0 - 100\b/.test(document.querySelector('.cmp-records-view-pager')?.textContent || ''), null, {timeout: 30000});
  });
  Object.assign(result, await s.scroll('.data-table-content'));
  await s.context.close();
  return result;
}

async function flaseSql(browser) {
  const s = await flaseSession(browser);
  await s.page.locator('.table-list-filter button[title="SQL console for shop"]').dispatchEvent('mousedown');
  await s.page.locator('.cmp-sql-console:visible .monaco-editor').first().waitFor();
  await s.page.waitForTimeout(500);
  await s.page.evaluate((sql) => {
    const editor = window.monaco.editor.getEditors().find((item) => item.getContainerDomNode().closest('.cmp-sql-console') && item.getContainerDomNode().offsetParent);
    editor.setValue(sql);
    editor.focus();
  }, SQL);
  const result = await s.measure(async () => {
    await s.page.keyboard.press('Control+Enter');
    await s.page.waitForFunction(() => {
      const console = [...document.querySelectorAll('.cmp-sql-console')].find((item) => item.offsetParent);
      return console.querySelectorAll('.console-result-grid .data-table-row').length > 20
        && /Records:\s*0 - 1000\b/.test(console.querySelector('.cmp-records-view-pager')?.textContent || '');
    }, null, {timeout: 30000});
  });
  Object.assign(result, await s.scroll('.cmp-sql-console:visible .console-result-grid .data-table-content'));
  await s.context.close();
  return result;
}

// --- phpMyAdmin
async function pmaSession(browser) {
  const s = await session(browser);
  await s.page.goto(PMA);
  await s.page.fill('#input_username', 'flase');
  await s.page.fill('#input_password', 'flase');
  await s.page.click('#input_go');
  await s.page.locator('#pma_navigation_tree').waitFor();
  // database page (structure) - start point like database opened in sidebar of Flase
  await s.page.goto(`${PMA}/index.php?route=/database/structure&db=shop`);
  await s.page.locator('#pma_navigation_tree a', {hasText: /^wide_test$/}).first().waitFor();
  await s.page.waitForTimeout(500);
  return s;
}
const pmaRows = (page, count) => page.waitForFunction((count) => document.querySelectorAll('table.table_results tbody tr').length >= count
  && !document.querySelector('#loading_parent .ajax_notification:not([style*="none"])'), count, {timeout: 60000});

async function pmaBrowse(browser) {
  const s = await pmaSession(browser);
  const result = await s.measure(async () => {
    await s.page.locator('#pma_navigation_tree a', {hasText: /^wide_test$/}).first().click();
    await pmaRows(s.page, 100);
  });
  Object.assign(result, await s.scroll('table.table_results'));
  await s.context.close();
  return result;
}

async function pmaSql(browser) {
  const s = await pmaSession(browser);
  await s.page.goto(`${PMA}/index.php?route=/database/sql&db=shop`);
  await s.page.locator('#sqlquery + .CodeMirror').waitFor();
  await s.page.waitForTimeout(500);
  await s.page.evaluate((sql) => document.querySelector('#sqlquery + .CodeMirror').CodeMirror.setValue(sql), SQL);
  const result = await s.measure(async () => {
    await s.page.click('#button_submit_query');
    await pmaRows(s.page, 1000);
  });
  Object.assign(result, await s.scroll('table.table_results'));
  await s.context.close();
  return result;
}

(async () => {
  const browser = await chromium.launch();
  const scenarios = [
    ['Browse table, 100 rows x 50 columns', {Flase: flaseBrowse, phpMyAdmin: pmaBrowse}],
    ['SQL query, 1000 rows x 50 columns', {Flase: flaseSql, phpMyAdmin: pmaSql}],
  ];
  const fields = [
    ['wall', 'Click to rendered rows', 'ms'], ['task', 'CPU time of page', 'ms'], ['script', 'JavaScript', 'ms'],
    ['layout', 'Layout', 'ms'], ['style', 'Style recalculation', 'ms'], ['elements', 'DOM elements', ''],
    ['heap', 'JS heap after GC', 'MB'], ['kb', 'Data received', 'KB'], ['scrollTask', 'CPU time of 20 scroll steps', 'ms'],
  ];
  for (const [name, tools] of scenarios) {
    const results = {};
    for (const [tool, run] of Object.entries(tools)) {
      await run(browser); // warm up
      results[tool] = [];
      for (let i = 0; i < RUNS; i++) {
        const r = await run(browser);
        results[tool].push(r);
        console.log(`RUN   ${name} | ${tool} | ${i + 1}: wall ${r.wall.toFixed(0)} ms, task ${r.task.toFixed(0)} ms, elements ${r.elements}, scroll ${r.scrollTask.toFixed(0)} ms`);
      }
    }
    console.log(`\n### ${name} (median of ${RUNS} runs)\n`);
    console.log('| | Flase | phpMyAdmin |');
    console.log('|---|---:|---:|');
    for (const [key, label, unit] of fields) {
      const value = (tool) => {
        const m = median(results[tool].map((r) => r[key]));
        return `${key === 'heap' ? m.toFixed(1) : Math.round(m).toLocaleString('en-US')}${unit ? ' ' + unit : ''}`;
      };
      console.log(`| ${label} | ${value('Flase')} | ${value('phpMyAdmin')} |`);
    }
    console.log('');
  }
  await browser.close();
})();
