// UI of export formats (XLSX, ODS, XML, LaTeX, HTML, PDF print), charts of results and map of spatial values.
// node ui-export-chart.js
const {chromium} = require('playwright');
const fs = require('fs');
const OUT = process.env.SHOTS || '/pw/shots';
const BASE = 'http://localhost:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};

/** entries of ZIP with stored (not compressed) files - format written by Flase */
const unzip = (buffer) => {
  const entries = {};
  const order = [];
  let offset = 0;
  while (buffer.readUInt32LE(offset) === 0x04034b50) {
    const method = buffer.readUInt16LE(offset + 8);
    const size = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.slice(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    entries[name] = method === 0 ? buffer.slice(start, start + size).toString('utf8') : null;
    order.push(name);
    offset = start + size;
  }
  const central = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  const end = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  return {entries, order, valid: central > 0 && end > central && buffer.readUInt16LE(end + 10) === order.length};
};

const login = async (connection) => (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({viewport: {width: 1500, height: 950}, acceptDownloads: true});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|tile\.openstreetmap/.test(m.text())) errors.push(m.text()); });

  const open = async (connection, database, table) => {
    const user = await login(connection);
    await page.goto('http://localhost:3000');
    await page.evaluate(([connection, user]) => {
      localStorage.clear();
      localStorage.setItem('connections', JSON.stringify([connection]));
      localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
    }, [connection, user]);
    await page.reload();
    await page.waitForTimeout(1500);
    await page.getByText(connection.displayName, {exact: true}).first().click();
    await page.waitForTimeout(300);
    await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
    await page.waitForTimeout(800);
    await page.locator('.vertical-slider-label', {hasText: new RegExp(`^${database}$`)}).click();
    await page.waitForTimeout(1000);
    await openTable(table);
  };
  const openTable = async (table) => {
    await page.locator('.table-list-menu-root li', {hasText: new RegExp(`^${table}$`)}).locator('button').dispatchEvent('mousedown');
    await page.waitForTimeout(1500);
  };
  const footer = () => page.locator('.cmp-records-view-pager:visible');
  const popup = () => page.locator('.popup-root.open').last();
  const exportAs = async (menu, label) => {
    await footer().getByRole('button', {name: 'Export', exact: true}).click();
    await page.getByRole('menuitem', {name: menu}).hover();
    await page.waitForTimeout(200);
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', {name: label, exact: true}).click();
    const file = await download;
    const path = `${OUT}/export-${file.suggestedFilename()}`;
    await file.saveAs(path);
    return {name: file.suggestedFilename(), buffer: fs.readFileSync(path)};
  };

  // --- MariaDB: formats of gis_test
  await open({id: 'ui-export', dsn: 'mysql://mariadb', username: 'flase', displayName: 'UI export', changeConfirmationRequired: false}, 'shop', 'gis_test');
  let file = await exportAs('Current page as', 'Excel (XLSX)');
  let zip = unzip(file.buffer);
  const sheet = zip.entries['xl/worksheets/sheet1.xml'] || '';
  check('XLSX package', file.name === 'gis_test.xlsx' && zip.valid && ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml'].every((name) => zip.order.includes(name)), JSON.stringify(zip.order));
  check('XLSX cells - header, numbers, texts, NULL left out', /<c r="A1" t="inlineStr" s="1"><is><t xml:space="preserve">id<\/t>/.test(sheet) && sheet.includes('<c r="C2"><v>1860000</v></c>')
    && sheet.includes('Kraków') && !/<c r="D6"/.test(sheet) && /<autoFilter ref="A1:F6"\/>/.test(sheet) && /sheet name="gis_test"/.test(zip.entries['xl/workbook.xml']), sheet.slice(0, 600));
  file = await exportAs('Current page as', 'OpenDocument (ODS)');
  zip = unzip(file.buffer);
  const content = zip.entries['content.xml'] || '';
  check('ODS package with mimetype first', zip.valid && zip.order[0] === 'mimetype' && zip.entries.mimetype === 'application/vnd.oasis.opendocument.spreadsheet' && zip.order.includes('META-INF/manifest.xml'), JSON.stringify(zip.order));
  check('ODS cells', content.includes('office:value-type="float" office:value="1860000"') && content.includes('<text:p>Gdańsk</text:p>') && content.includes('<table:table table:name="gis_test">'), content.slice(0, 400));
  file = await exportAs('Current page as', 'XML');
  let text = file.buffer.toString('utf8');
  check('XML with NULL as xsi:nil', text.startsWith('<?xml version="1.0" encoding="UTF-8"?>') && text.includes('<resultset name="gis_test"') && text.includes('<field name="name">Wrocław</field>')
    && text.includes('<field name="location" xsi:nil="true" />'), text.slice(0, 400));
  file = await exportAs('Current page as', 'LaTeX');
  text = file.buffer.toString('utf8');
  check('LaTeX table', file.name === 'gis_test.tex' && text.startsWith('\\begin{longtable}{|l|l|l|l|l|l|}') && text.includes('\\textbf{population}') && text.includes('\\textit{NULL}') && text.trim().endsWith('\\end{longtable}'), text.slice(0, 300));
  file = await exportAs('Current page as', 'HTML');
  text = file.buffer.toString('utf8');
  check('HTML document', text.startsWith('<!DOCTYPE html>') && text.includes('<th>population</th>') && text.includes('<td class="null">NULL</td>'), text.slice(0, 200));

  // pdf - printable page in new window
  await footer().getByRole('button', {name: 'Export', exact: true}).click();
  await page.getByRole('menuitem', {name: 'All rows as'}).hover();
  await page.waitForTimeout(200);
  const popupPage = page.waitForEvent('popup');
  await page.getByRole('menuitem', {name: 'PDF (print)…', exact: true}).click();
  const printPage = await popupPage;
  await printPage.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0, null, {timeout: 10000}).catch(() => null);
  check('PDF print page with all rows', await printPage.locator('tbody tr').count() === 5 && /gis_test/.test(await printPage.title()), await printPage.locator('body').innerText().catch(() => ''));
  await printPage.close();

  // --- chart
  await footer().getByRole('button', {name: 'Chart'}).click();
  await page.waitForTimeout(600);
  const chart = popup().locator('.cmp-result-chart');
  check('chart defaults: names and population', await chart.getByLabel('Label column').inputValue() === 'name' && await chart.getByLabel('Values population').isChecked()
    && !(await chart.getByLabel('Values id').isChecked()), await chart.innerText());
  check('bar chart', await chart.locator('.chart-bar').count() === 5 && /Warszawa · population: 1\.86M/.test(await chart.locator('.chart-bar title').first().textContent()), await chart.locator('.chart-bar title').first().textContent());
  await page.screenshot({path: `${OUT}/chart-01-bar.png`});
  await chart.getByRole('tab', {name: 'pie'}).click();
  check('pie chart without zero slice', await chart.locator('.chart-slice').count() === 4 && /Warszawa - 48\.7 %/.test(await chart.locator('.chart-legend-text').first().textContent()), await chart.locator('.chart-legend-text').first().textContent());
  await chart.getByRole('tab', {name: 'line'}).click();
  check('line chart', await chart.locator('.chart-line').count() === 1 && await chart.locator('.chart-point').count() === 5);
  const png = page.waitForEvent('download');
  await popup().getByRole('button', {name: 'Export PNG'}).click();
  const pngFile = await png;
  await pngFile.saveAs(`${OUT}/export-chart.png`);
  check('chart as PNG', pngFile.suggestedFilename() === 'gis_test-chart.png' && fs.readFileSync(`${OUT}/export-chart.png`).slice(1, 4).toString() === 'PNG');
  await popup().getByRole('button', {name: 'Close'}).click();

  // --- map
  await footer().getByRole('button', {name: 'Map'}).click();
  await page.waitForTimeout(800);
  const map = popup().locator('.cmp-result-map');
  check('map of points with labels', await map.locator('circle.point').count() === 4 && (await map.locator('.map-label').allTextContents()).includes('Kraków')
    && /4 of 5 rows with geometry · longitude \/ latitude/.test(await map.locator('.map-count').innerText()) && await map.locator('.map-attribution').count() === 1, await map.locator('.map-count').innerText());
  check('OpenStreetMap tiles requested', await map.locator('image.map-tile').count() > 0 && /tile\.openstreetmap\.org\/\d+\//.test(await map.locator('image.map-tile').first().getAttribute('href')));
  await page.screenshot({path: `${OUT}/map-01-points.png`});
  await map.locator('[data-row="1"] circle').click();
  check('details of clicked row', /Row 2/.test(await map.locator('.map-details').innerText()) && /Kraków/.test(await map.locator('.map-details').innerText()));
  await map.getByLabel('Geometry column').selectOption('area');
  await page.waitForTimeout(300);
  check('polygon', await map.locator('path.polygon').count() === 1 && await map.locator('circle.point').count() === 0);
  await map.getByLabel('Geometry column').selectOption('route');
  await page.waitForTimeout(300);
  check('lines', await map.locator('path.line').count() === 2);
  await map.getByRole('button', {name: 'Zoom in'}).click();
  await map.getByRole('button', {name: 'Fit'}).click();
  await popup().getByRole('button', {name: 'Close'}).click();

  // --- grouping of chart: orders by status
  await openTable('orders');
  await footer().getByRole('button', {name: 'Chart'}).click();
  await page.waitForTimeout(600);
  const ordersChart = popup().locator('.cmp-result-chart');
  await ordersChart.getByLabel('Label column').selectOption('status');
  await ordersChart.getByLabel('Aggregate').selectOption('count');
  await page.waitForTimeout(300);
  const bars = await ordersChart.locator('.chart-bar title').allTextContents();
  check('count of rows by status', bars.length >= 2 && bars.length <= 4 && bars.every((bar) => /count: \d+/.test(bar))
    && bars.reduce((total, bar) => total + Number(/count: (\d+)/.exec(bar)[1]), 0) === 100, JSON.stringify(bars));
  check('no map without spatial column', await footer().getByRole('button', {name: 'Map'}).count() === 0);
  await popup().getByRole('button', {name: 'Close'}).click();

  // --- PostgreSQL: native point type and WKT text
  await open({id: 'ui-export-pg', dsn: 'postgresql://postgres:5432/shop', username: 'flase', displayName: 'UI export pg', changeConfirmationRequired: false}, 'public', 'gis_test');
  await footer().getByRole('button', {name: 'Map'}).click();
  await page.waitForTimeout(800);
  const pgMap = popup().locator('.cmp-result-map');
  const geometryColumns = await pgMap.getByLabel('Geometry column').locator('option').allTextContents();
  check('PostgreSQL spatial columns (types and WKT values)', geometryColumns.join() === 'location (point),area (polygon),wkt (text)', geometryColumns.join());
  check('PostgreSQL points', await pgMap.locator('circle.point').count() === 4);
  await pgMap.getByLabel('Geometry column').selectOption('wkt');
  await page.waitForTimeout(300);
  check('WKT point and line', await pgMap.locator('circle.point').count() === 1 && await pgMap.locator('path.line').count() === 1);
  await popup().getByRole('button', {name: 'Close'}).click();
  file = await exportAs('Current page as', 'Excel (XLSX)');
  check('PostgreSQL XLSX', unzip(file.buffer).entries['xl/worksheets/sheet1.xml'].includes('<v>486000</v>'));

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
