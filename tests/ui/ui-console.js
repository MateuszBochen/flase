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
  const context = await browser.newContext({viewport: {width: 1500, height: 900}, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.removeItem('query_history'); localStorage.removeItem('saved_queries'); localStorage.removeItem('connections'); localStorage.removeItem('established_connections');
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
  await page.getByText('orders', {exact: true}).first().dispatchEvent('mousedown');
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
  const visibleTab = () => page.locator('.table-records-root:visible');
  const grid = () => visibleTab().locator('.cmp-records-view');
  const rows = () => grid().locator('.data-table-row');
  const query = async () => (await visibleTab().locator('.monaco-editor').innerText()).replace(/\s+/g, ' ').trim();
  const tabLabels = async () => (await page.locator('[class*="tab-label-list-item"], [class*="tab-label"] li, [class*="tab-label"] > *').allInnerTexts());
  const columnIndex = async (name) => (await grid().locator('.header-cell .column-name').allInnerTexts()).indexOf(name);
  const cell = async (row, name) => rows().nth(row).locator('.data-table-cell').nth(await columnIndex(name));

  page.on('dialog', async (dialog) => {
    if (dialog.type() === 'prompt') await dialog.accept('customers count');
    else await dialog.accept();
  });
  const consoleTab = () => page.locator('.cmp-sql-console:visible');
  const setConsoleText = (text, offset) => page.evaluate(([text, offset]) => {
    const editor = window.monaco.editor.getEditors().find((item) => item.getContainerDomNode().closest('.cmp-sql-console') && item.getContainerDomNode().offsetParent);
    editor.setValue(text);
    const position = editor.getModel().getPositionAt(offset ?? text.length);
    editor.setPosition(position);
    editor.setSelection({startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column});
    editor.focus();
  }, [text, offset]);
  const selectConsoleText = (from, to) => page.evaluate(([from, to]) => {
    const editor = window.monaco.editor.getEditors().find((item) => item.getContainerDomNode().closest('.cmp-sql-console') && item.getContainerDomNode().offsetParent);
    const model = editor.getModel();
    const a = model.getPositionAt(from); const b = model.getPositionAt(to);
    editor.setSelection({startLineNumber: a.lineNumber, startColumn: a.column, endLineNumber: b.lineNumber, endColumn: b.column});
    editor.focus();
  }, [from, to]);
  const focusEditor = () => page.evaluate(() => window.monaco.editor.getEditors().find((item) => item.getContainerDomNode().closest('.cmp-sql-console') && item.getContainerDomNode().offsetParent).focus());
  const logs = async () => {
    const tab = consoleTab().getByRole('tab', {name: /^Messages/});
    const wasActive = await tab.evaluate((element) => element.classList.contains('active'));
    await tab.click();
    const texts = (await consoleTab().locator('.console-log').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '));
    if (!wasActive) await consoleTab().locator('.console-result-tabs button').nth(1).click();
    return texts;
  };
  const resultTabs = async () => (await consoleTab().locator('.console-result-tabs button').allInnerTexts());
  const resultRows = () => consoleTab().locator('.console-result-grid .data-table-row');
  const waitIdle = async () => { for (let i = 0; i < 100 && await consoleTab().getByRole('button', {name: 'Cancel'}).count(); i++) await page.waitForTimeout(100); await page.waitForTimeout(400); };

  // --- open console for database from sidebar
  await page.locator('.table-list-filter button[title="SQL console for shop"]').dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  check('console opened with database', await consoleTab().count() === 1 && (await consoleTab().locator('.console-database').inputValue()) === 'shop');

  const script = "SELECT COUNT(*) AS n FROM customers;\nUPDATE edit_test SET note = 'c1' WHERE id = 1;\nSELECT id, note FROM edit_test ORDER BY id;";
  await setConsoleText(script);
  await page.keyboard.press('Control+Enter');
  await waitIdle();
  check('Ctrl+Enter runs statement under cursor', (await logs()).length === 1 && (await logs())[0].includes('SELECT id, note') && await resultRows().count() === 3, JSON.stringify(await logs()));

  await focusEditor();
  await page.keyboard.press('Control+Shift+Enter');
  await waitIdle();
  let l = await logs();
  check('Ctrl+Shift+Enter runs all', l.length === 3 && l[1].includes('1 row(s) affected') && l.every((x) => x.startsWith('✓')), JSON.stringify(l));
  check('result tab per rows result', JSON.stringify(await resultTabs()) === JSON.stringify(['Messages', 'Result 1', 'Result 3']), JSON.stringify(await resultTabs()));
  await consoleTab().getByRole('tab', {name: 'Result 3'}).click();
  await page.waitForTimeout(300);
  check('update visible in later result', (await resultRows().nth(0).innerText()).includes('c1'));
  const footerBox = await consoleTab().locator('.cmp-records-view-pager').boundingBox();
  const viewport = page.viewportSize();
  check('console result footer inside window', footerBox && footerBox.y + footerBox.height <= viewport.height && (await consoleTab().locator('.cmp-records-view-pager-root').evaluate((e) => getComputedStyle(e).display)) === 'flex', JSON.stringify(footerBox));
  await page.screenshot({path: `${OUT}/95-console.png`});

  // selection
  await selectConsoleText(0, 35);
  await page.keyboard.press('Control+Enter');
  await waitIdle();
  check('selection executed', (await logs()).length === 1 && (await logs())[0].includes('COUNT(*)'), JSON.stringify(await logs()));

  // error stops
  await setConsoleText('SELECT 1 AS a;\nSELEC 2;\nSELECT 3 AS c;');
  await page.keyboard.press('Control+Shift+Enter');
  await waitIdle();
  l = await logs();
  check('error stops execution', l[1].startsWith('✕') && /syntax/.test(l[1]) && /not executed/.test(l[2]) && (await resultTabs())[0].includes('⚠'), JSON.stringify(l));

  // truncation
  await setConsoleText('SELECT * FROM orders a JOIN digits b;');
  await page.keyboard.press('Control+Enter');
  await waitIdle();
  await consoleTab().getByRole('tab', {name: 'Messages'}).click();
  check('large result truncated', /5,000 rows, first 1,000 shown/.test((await logs())[0]), JSON.stringify(await logs()));

  // explain
  await setConsoleText('SELECT * FROM orders WHERE customer_id = 8;', 5);
  await consoleTab().getByRole('button', {name: 'Explain'}).click();
  await waitIdle();
  const headers = await consoleTab().locator('.console-result-grid .header-cell .column-name').allInnerTexts();
  check('explain as table', headers.includes('select_type') && headers.includes('key'), JSON.stringify(headers));

  // USE changes database
  await setConsoleText('USE blog;\nSELECT DATABASE() AS db;');
  await page.keyboard.press('Control+Shift+Enter');
  await waitIdle();
  check('USE changes selected database', (await consoleTab().locator('.console-database').inputValue()) === 'blog' && (await resultRows().nth(0).innerText()).includes('blog'));
  await consoleTab().locator('.console-database').selectOption('shop');

  // cancel
  await setConsoleText('SELECT o.id, BENCHMARK(20000000, MD5(o.id)) AS b FROM orders o;');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(800);
  const cancelButton = consoleTab().getByRole('button', {name: 'Cancel'});
  check('cancel visible while running', await cancelButton.count() === 1);
  await cancelButton.click();
  await waitIdle();
  check('cancel stops query', /interrupted/i.test((await logs())[0]), JSON.stringify(await logs()));

  // history + saved
  const historyItems = consoleTab().locator('.cmp-query-library .library-item');
  check('history kept', (await historyItems.count()) >= 8 && (await historyItems.first().innerText()).includes('BENCHMARK'), String(await historyItems.count()));
  await setConsoleText('');
  await historyItems.filter({hasText: 'SELECT COUNT(*) AS n FROM customers'}).first().locator('.library-sql').click();
  await page.waitForTimeout(200);
  const editorValue = await page.evaluate(() => window.monaco.editor.getEditors().find((e) => e.getContainerDomNode().closest('.cmp-sql-console') && e.getContainerDomNode().offsetParent).getValue());
  check('history item inserted into editor', editorValue.includes('SELECT COUNT(*) AS n FROM customers;'), JSON.stringify(editorValue));
  await setConsoleText('SELECT COUNT(*) AS n FROM customers;', 3);
  await consoleTab().getByRole('button', {name: /Save/}).click();
  await page.waitForTimeout(300);
  await consoleTab().getByRole('tab', {name: /Saved/}).click();
  check('query saved', (await consoleTab().locator('.library-name').allInnerTexts()).includes('customers count'));
  await consoleTab().locator('.library-item', {hasText: 'customers count'}).locator('button[title="Run"]').click();
  await waitIdle();
  check('saved query runs', (await logs())[0]?.includes('1 row(s)'), JSON.stringify(await logs()));

  // persistence after reload
  await page.reload();
  await page.waitForTimeout(1500);
  await page.getByText('UI test', {exact: true}).first().click();
  await page.waitForTimeout(300);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(800);
  await page.locator('button[title="SQL console"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  check('history survives reload', (await consoleTab().locator('.cmp-query-library .library-item').count()) >= 8);
  check('console from connection has no database', (await consoleTab().locator('.console-database').inputValue()) === '');

  // processlist + kill query from console
  await setConsoleText('SELECT SLEEP(20) AS s;');
  await page.keyboard.press('Control+Enter');
  await page.waitForTimeout(500);
  await page.locator('button[title="Processlist"]').first().dispatchEvent('mousedown', {button: 1});
  await page.waitForTimeout(1500);
  await page.locator('[class*="tab-label"]').filter({hasText: 'Processes:'}).last().click();
  await page.waitForTimeout(1500);
  const processes = page.locator('.cmp-process-list:visible');
  const sleepRow = processes.locator('tr', {hasText: 'SLEEP(20)'});
  check('processlist shows console query', await sleepRow.count() === 1 && (await sleepRow.innerText()).includes('app'), await processes.locator('tbody').innerText().catch(() => ''));
  await page.screenshot({path: `${OUT}/96-processlist.png`});
  await sleepRow.getByRole('button', {name: 'Kill query'}).click();
  await page.waitForTimeout(1500);
  check('killed query gone from list', await processes.locator('tr', {hasText: 'SLEEP(20)'}).count() === 0);
  await page.locator('[class*="tab-label"]').filter({hasText: 'Console:'}).last().click();
  await waitIdle();
  check('console query ended after kill', (await logs())[0]?.startsWith('✓') || /interrupted/i.test((await logs())[0] || ''), JSON.stringify(await logs()));

  // data tab: explain + cancel (sidebar was collapsed by reload)
  await page.getByText('shop', {exact: true}).first().click();
  await page.waitForTimeout(1000);
  await page.getByText('orders', {exact: true}).first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);
  await visibleTab().getByRole('button', {name: 'Explain query'}).click();
  await page.waitForTimeout(1500);
  await page.screenshot({path: `${OUT}/97-explain.png`});
  const explainHeaders = await page.locator('.cmp-explain .header-cell .column-name').allInnerTexts();
  check('explain row visible', await page.locator('.cmp-explain .data-table-row').count() === 1);
  check('explain popup in data tab', explainHeaders.includes('select_type') && (await page.locator('.cmp-explain .explain-query').innerText()).startsWith('EXPLAIN SELECT'), JSON.stringify(explainHeaders));
  await page.getByRole('button', {name: 'Close'}).click();
  await visibleTab().locator('.monaco-editor').click();
  await page.keyboard.press('Control+A');
  await page.keyboard.type('SELECT o.*, BENCHMARK(20000000, MD5(o.id)) AS b FROM orders o', {delay: 2});
  await page.keyboard.press('Escape');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
  const gridCancel = grid().getByRole('button', {name: 'Cancel'});
  check('grid shows cancel while loading', await gridCancel.count() === 1);
  await gridCancel.click();
  await page.waitForTimeout(1000);
  check('grid query cancelled', /interrupted/i.test(await grid().locator('.cmp-records-view-message-error').innerText().catch(() => '')));

  check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 500));
  await browser.close();
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
