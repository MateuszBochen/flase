// Speed of Flase compared with popular web database tools (results are on https://flase.dev/benchmark.html).
//   node bench-tools.js [runs] [filter]
// filter (optional) is a regular expression of "engine | scenario | tool", e.g. "mariadb.*Adminer".
//
// All tools run in Docker network of Flase tests and are connected to the same databases (user flase / flase, database shop):
//   Flase      http://localhost:3010  production image
//   phpMyAdmin http://localhost:8090  $cfg['MaxRows'] = 100           (MariaDB)
//   Adminer    http://localhost:8091                                   (MariaDB, PostgreSQL)
//   pgAdmin 4  http://localhost:8092  server "bench" with PassFile     (PostgreSQL)
//   CloudBeaver http://localhost:8093 connections mariadb-bench / postgres-bench shared with team "user", resultset.maxrows = 100
//              (SQL test is run separately with resultset.maxrows = 1000: node bench-tools.js 7 "SQL.*CloudBeaver")
// Tables: wide_test (50 columns, 1000 rows), fk_test (24 columns, 20 foreign keys to ref_01 ... ref_20, 1000 rows).
//
// Every run is a new browser context, tool is opened at the database (table list) - that is not measured.
// Measured is one action: click on table (or run of query) until all rows are rendered:
// time, CPU time of the page (CDP TaskDuration), DOM elements, JS heap after GC and data received.
// The first run of each tool and scenario warms up caches of the tool and of the database and is not counted.
const {chromium} = require('playwright');

const RUNS = Number(process.argv[2] || 5);
const FILTER = new RegExp(process.argv[3] || '.', 'i');
const URL = {flase: process.env.FLASE_URL || 'http://localhost:3010', pma: 'http://localhost:8090', adminer: 'http://localhost:8091', pgadmin: 'http://localhost:8092', cloudbeaver: 'http://localhost:8093'};
const SQL = 'SELECT * FROM wide_test LIMIT 1000';

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const frames = (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const exact = (text) => new RegExp(`^${text}$`);

async function session(browser, options = {}) {
  // locale - pgAdmin does not start with empty locale of headless Chromium
  // bypassCSP - Content Security Policy of Adminer and pgAdmin does not allow script of waitForFunction
  const context = await browser.newContext({viewport: {width: 1920, height: 1080}, locale: 'en-US', bypassCSP: true, ...options});
  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await cdp.send('Network.enable');
  let bytes = 0;
  cdp.on('Network.loadingFinished', (event) => { bytes += event.encodedDataLength; });
  cdp.on('Network.webSocketFrameReceived', (event) => { bytes += event.response.payloadData.length; });
  const task = async () => {
    const {metrics} = await cdp.send('Performance.getMetrics');
    return metrics.find((metric) => metric.name === 'TaskDuration').value * 1000;
  };
  /** runs action (it waits for rendered rows), then measures state of the page */
  const measure = async (action) => {
    const before = await task();
    bytes = 0;
    const start = performance.now();
    await action();
    await frames(page);
    const wall = performance.now() - start;
    const cpu = await task() - before;
    const kb = bytes / 1024;
    await cdp.send('HeapProfiler.collectGarbage');
    const {usedSize} = await cdp.send('Runtime.getHeapUsage');
    const elements = await page.evaluate(() => document.getElementsByTagName('*').length);
    return {wall, cpu, elements, heap: usedSize / 1048576, kb};
  };
  return {context, page, measure};
}

// --- Flase
const flase = {
  async open(browser, engine) {
    const s = await session(browser);
    const pg = engine === 'postgres';
    const connection = {id: 'bench', dsn: pg ? 'postgresql://postgres:5432/shop' : 'mysql://mariadb', username: 'flase', displayName: 'Bench', changeConfirmationRequired: false};
    const user = await (await fetch(`${URL.flase}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();
    await s.page.goto(URL.flase);
    await s.page.evaluate(([connection, user]) => {
      localStorage.clear();
      localStorage.setItem('connections', JSON.stringify([connection]));
      localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
    }, [connection, user]);
    await s.page.reload();
    await s.page.getByText('Bench', {exact: true}).first().click();
    await s.page.locator('button[title="Load database list"]').first().waitFor();
    await s.page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
    await s.page.getByText(pg ? 'public' : 'shop', {exact: true}).first().click();
    await s.page.getByText('wide_test', {exact: true}).first().waitFor();
    await s.page.waitForTimeout(500);
    return s;
  },
  async browse(s, table) {
    return s.measure(async () => {
      await s.page.getByText(table, {exact: true}).first().click();
      await s.page.waitForFunction(() => document.querySelectorAll('.data-table-row').length > 20
        && /Records:\s*0 - 100\b/.test(document.querySelector('.cmp-records-view-pager')?.textContent || ''));
    });
  },
  async sql(s) {
    await s.page.locator('.table-list-filter button[title^="SQL console for"]').first().dispatchEvent('mousedown');
    await s.page.locator('.cmp-sql-console:visible .monaco-editor').first().waitFor();
    await s.page.waitForTimeout(500);
    await s.page.evaluate((sql) => {
      const editor = window.monaco.editor.getEditors().find((item) => item.getContainerDomNode().closest('.cmp-sql-console') && item.getContainerDomNode().offsetParent);
      editor.setValue(sql);
      editor.focus();
    }, SQL);
    return s.measure(async () => {
      await s.page.keyboard.press('Control+Enter');
      await s.page.waitForFunction(() => {
        const console = [...document.querySelectorAll('.cmp-sql-console')].find((item) => item.offsetParent);
        return console.querySelectorAll('.console-result-grid .data-table-row').length > 20
          && /Records:\s*0 - 1000\b/.test(console.querySelector('.cmp-records-view-pager')?.textContent || '');
      });
    });
  },
};

// --- phpMyAdmin (MariaDB)
const pmaRows = (page, count) => page.waitForFunction((count) => document.querySelectorAll('table.table_results tbody tr').length >= count
  && !document.querySelector('#loading_parent .ajax_notification:not([style*="none"])'), count);
const phpMyAdmin = {
  async open(browser) {
    const s = await session(browser);
    await s.page.goto(URL.pma);
    await s.page.fill('#input_username', 'flase');
    await s.page.fill('#input_password', 'flase');
    await s.page.click('#input_go');
    await s.page.locator('#pma_navigation_tree').waitFor();
    await s.page.goto(`${URL.pma}/index.php?route=/database/structure&db=shop`);
    await s.page.locator('#pma_navigation_tree a', {hasText: /^wide_test$/}).first().waitFor();
    await s.page.waitForTimeout(500);
    return s;
  },
  async browse(s, table) {
    return s.measure(async () => {
      await s.page.locator('#pma_navigation_tree a', {hasText: exact(table)}).first().click();
      await pmaRows(s.page, 100);
    });
  },
  async sql(s) {
    await s.page.goto(`${URL.pma}/index.php?route=/database/sql&db=shop`);
    await s.page.locator('#sqlquery + .CodeMirror').waitFor();
    await s.page.waitForTimeout(500);
    await s.page.evaluate((sql) => document.querySelector('#sqlquery + .CodeMirror').CodeMirror.setValue(sql), SQL);
    return s.measure(async () => {
      await s.page.click('#button_submit_query');
      await pmaRows(s.page, 1000);
    });
  },
};

// --- Adminer - every action loads a new page; it shows 50 rows by default, limit=100 is the same page as other tools
const adminer = {
  async open(browser, engine) {
    // Content Security Policy of Adminer does not allow script of waitForFunction
    const s = await session(browser, {bypassCSP: true});
    const pg = engine === 'postgres';
    await s.page.goto(URL.adminer);
    await s.page.selectOption('select[name="auth[driver]"]', pg ? 'pgsql' : 'server');
    await s.page.fill('input[name="auth[server]"]', pg ? 'postgres' : 'mariadb');
    await s.page.fill('input[name="auth[username]"]', 'flase');
    await s.page.fill('input[name="auth[password]"]', 'flase');
    await s.page.fill('input[name="auth[db]"]', 'shop');
    await s.page.click('input[type=submit]');
    await s.page.locator('#tables a.select[href*="select=wide_test"]').first().waitFor();
    s.base = s.page.url().replace(/&(select|sql|table)=.*$/, '');
    if (pg && !/[?&]ns=/.test(s.base)) {
      s.base += '&ns=public';
    }
    await s.page.waitForTimeout(500);
    return s;
  },
  async browse(s, table) {
    return s.measure(async () => {
      await s.page.goto(`${s.base}&select=${table}&limit=100`);
      await s.page.waitForFunction(() => document.querySelectorAll('table.checkable tbody tr').length >= 100);
    });
  },
  async sql(s) {
    await s.page.goto(`${s.base}&sql=`);
    await s.page.locator('textarea[name=query]').waitFor({state: 'attached'});
    await s.page.evaluate((sql) => {
      document.querySelector('textarea[name=query]').value = sql;
      const editor = document.querySelector('pre.jush[contenteditable]');
      if (editor) {
        editor.textContent = sql;
      }
    }, SQL);
    return s.measure(async () => {
      await s.page.locator('input[type=submit][value=Execute]').click();
      await s.page.waitForFunction(() => document.querySelectorAll('table tbody tr').length >= 1000);
    });
  },
};

// --- pgAdmin 4 (PostgreSQL) - object tree is virtualized: table is scrolled into view before the measured click
const pgAdmin = {
  async open(browser) {
    const s = await session(browser);
    const page = s.page;
    await page.goto(`${URL.pgadmin}/browser/`);
    s.entry = (name) => page.locator('.file-entry').filter({has: page.locator('.file-name', {hasText: exact(name)})}).first();
    for (const name of ['Servers', 'bench', 'Databases', 'shop', 'Schemas', 'public', 'Tables']) {
      await s.entry(name).waitFor();
      await page.waitForTimeout(300);
      if (!(await s.entry(name).locator('.directory-toggle.open').count())) {
        await s.entry(name).dblclick();
      }
      await page.waitForTimeout(800);
    }
    await s.entry('wide_test').waitFor({state: 'attached'}).catch(() => undefined);
    await page.waitForTimeout(500);
    return s;
  },
  /** Query Tool (also of View/Edit Data) is an iframe - the new one after the action */
  async toolFrame(page, before) {
    for (let i = 0; i < 6000; i++) {
      const frame = page.frames().find((item) => !before.includes(item) && /sqleditor/.test(item.url()));
      if (frame) return frame;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error('Query Tool of pgAdmin was not opened');
  },
  rendered: (frame, count) => frame.waitForFunction((count) => !!document.body && new RegExp(`Total rows: ${count}\\b`).test(document.body.innerText)
    && document.querySelectorAll('[role=row]').length > 10, count, {polling: 'raf'}),
  async browse(s, table) {
    const page = s.page;
    const scroller = page.locator('[data-auto-sizer] > div').first();
    for (let top = 0; !(await s.entry(table).count()); top += 400) {
      await scroller.evaluate((element, top) => element.scrollTop = top, top);
      await page.waitForTimeout(150);
    }
    await s.entry(table).click({button: 'right'});
    await page.getByRole('menuitem', {name: /View\/Edit Data/}).hover();
    const item = page.getByRole('menuitem', {name: /First 100 Rows/});
    await item.waitFor();
    const before = page.frames();
    return s.measure(async () => {
      await item.click();
      await pgAdmin.rendered(await pgAdmin.toolFrame(page, before), 100);
    });
  },
  async sql(s) {
    const page = s.page;
    await s.entry('shop').click({button: 'right'});
    const before = page.frames();
    await page.getByRole('menuitem', {name: /^Query Tool/}).first().click();
    const frame = await pgAdmin.toolFrame(page, before);
    const editor = frame.locator('.cm-content').first();
    await editor.waitFor();
    await page.waitForTimeout(1000);
    await editor.click();
    await page.keyboard.type(SQL);
    return s.measure(async () => {
      await page.keyboard.press('F5');
      await pgAdmin.rendered(frame, 1000);
    });
  },
};

// --- CloudBeaver (web DBeaver) - navigator tree is scrolled to the table before the measured double click
const cloudBeaver = {
  async open(browser, engine) {
    const s = await session(browser);
    const page = s.page;
    const pg = engine === 'postgres';
    await page.goto(URL.cloudbeaver);
    s.node = (name) => page.locator('[data-tree-node-control]').filter({hasText: name instanceof RegExp ? name : exact(name)}).first();
    s.connection = pg ? 'postgres-bench' : 'mariadb-bench';
    // schema node has description: "public - standard public schema"
    const path = pg ? [s.connection, 'Databases', 'shop', 'Schemas', /^public\b/, 'Tables'] : [s.connection, 'Databases', 'shop', 'Tables'];
    for (const name of path) {
      await s.node(name).waitFor();
      const expand = s.node(name).locator('[aria-label=Expand]');
      if (await expand.count()) {
        await expand.click();
      }
      await page.waitForTimeout(1000);
    }
    await page.getByText('wide_test', {exact: true}).first().waitFor({state: 'attached'}).catch(() => undefined);
    await page.waitForTimeout(500);
    return s;
  },
  rendered: (page, count) => page.waitForFunction((count) => new RegExp(`\\b${count} row\\(s\\) fetched`).test(document.body.innerText)
    && document.querySelectorAll('.rdg-row').length > 10, count),
  async browse(s, table) {
    const page = s.page;
    const leaf = page.getByText(table, {exact: true}).first();
    await page.mouse.move(120, 600);
    for (let i = 0; i < 40 && !(await leaf.isVisible()); i++) {
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(150);
    }
    return s.measure(async () => {
      await leaf.dblclick();
      await cloudBeaver.rendered(page, 100);
    });
  },
  async sql(s) {
    const page = s.page;
    await s.node(s.connection).click();
    await page.locator('button[title^="Open SQL Editor"]').first().click();
    const editor = page.locator('.cm-content').last();
    await editor.waitFor();
    await page.waitForTimeout(1000);
    // editor restores script of previous session - it is replaced. Server runs with resultset.maxrows = 1000 for this
    // test (a new result always starts with the default fetch size, 100 in the other tests)
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type(SQL);
    await page.waitForTimeout(500);
    return s.measure(async () => {
      await page.keyboard.press('Control+Enter');
      // footer shows count of fetched rows ("1000+" - it does not know there are no more rows)
      await page.waitForFunction(() => /\n1000\+?\n/.test(document.body.innerText) && document.querySelectorAll('.rdg-row').length > 10);
    });
  },
};

const ENGINES = {
  mariadb: {name: 'MariaDB 11.4', tools: {Flase: flase, phpMyAdmin, Adminer: adminer, CloudBeaver: cloudBeaver}},
  postgres: {name: 'PostgreSQL 17', tools: {Flase: flase, 'pgAdmin 4': pgAdmin, Adminer: adminer, CloudBeaver: cloudBeaver}},
};
const SCENARIOS = [
  {id: 'browse', name: 'Browse table, 100 rows × 50 columns', run: (tool, s) => tool.browse(s, 'wide_test')},
  {id: 'fk', name: 'Browse table with 20 foreign keys, 100 rows', run: (tool, s) => tool.browse(s, 'fk_test')},
  {id: 'sql', name: 'SQL query, 1000 rows × 50 columns', run: (tool, s) => tool.sql(s)},
];

(async () => {
  const browser = await chromium.launch();
  const all = [];
  for (const [engine, {name: engineName, tools}] of Object.entries(ENGINES)) {
    for (const scenario of SCENARIOS) {
      for (const [toolName, tool] of Object.entries(tools)) {
        const label = `${engine} | ${scenario.name} | ${toolName}`;
        if (!FILTER.test(label)) {
          continue;
        }
        const results = [];
        for (let i = 0; i <= RUNS; i++) {
          let s = null;
          try {
            s = await tool.open(browser, engine);
            const r = await scenario.run(tool, s);
            if (i > 0) {
              results.push(r);
            }
            console.log(`RUN   ${label} | ${i ? i : 'warm-up'}: ${r.wall.toFixed(0)} ms, CPU ${r.cpu.toFixed(0)} ms, ${r.elements} elements, ${r.heap.toFixed(1)} MB, ${r.kb.toFixed(0)} KB`);
          } catch (error) {
            console.log(`ERROR ${label} | ${i}: ${error.message.split('\n')[0]}`);
            await s?.page.screenshot({path: `/pw/shots/bench-error-${engine}-${scenario.id}-${toolName.replace(/\W/g, '')}.png`}).catch(() => undefined);
          }
          await s?.context.close();
        }
        if (results.length) {
          const m = (key) => median(results.map((r) => r[key]));
          all.push({engine: engineName, scenario: scenario.name, tool: toolName, runs: results.length,
            wall: m('wall'), cpu: m('cpu'), elements: m('elements'), heap: m('heap'), kb: m('kb')});
          // results so far - an error later does not lose them
          require('fs').writeFileSync(process.env.RESULTS_FILE || '/pw/shots/bench-results.json', JSON.stringify(all));
        }
      }
    }
  }
  await browser.close();
  console.log('\nRESULTS ' + JSON.stringify(all));
  let last = '';
  for (const r of all) {
    const head = `${r.engine} - ${r.scenario}`;
    if (head !== last) {
      console.log(`\n### ${head} (median of ${RUNS} runs)\n\n| | Time to rendered rows | CPU time of page | DOM elements | JS heap | Data received |\n|---|---:|---:|---:|---:|---:|`);
      last = head;
    }
    console.log(`| ${r.tool} | ${Math.round(r.wall).toLocaleString('en-US')} ms | ${Math.round(r.cpu).toLocaleString('en-US')} ms | ${Math.round(r.elements).toLocaleString('en-US')} | ${r.heap.toFixed(1)} MB | ${Math.round(r.kb).toLocaleString('en-US')} KB |`);
  }
})();
