// Many databases: closed databases around the open one are folded into one row, list of tables gets the space.
// node ui-sidebar-fold.js   (tests/run.sh creates databases afold01..15 and zfold01..15 before)
const {chromium} = require('playwright');
const OUT = process.env.SHOTS || '/pw/shots';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 400) : ''}`);
};

const login = async (connection) => (await fetch('http://localhost:3001/api/login', {method: 'POST', headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();

(async () => {
  const maria = {id: 'fold-maria', dsn: 'mysql://mariadb', username: 'flase', displayName: 'Fold Maria', changeConfirmationRequired: false};
  const user = await login(maria);
  const browser = await chromium.launch();
  const page = await (await browser.newContext({viewport: {width: 1400, height: 700}})).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('http://localhost:3000');
  await page.evaluate(([connection, user]) => {
    localStorage.clear();
    localStorage.setItem('connections', JSON.stringify([connection]));
    localStorage.setItem('established_connections', JSON.stringify({[connection.id]: {user, connection}}));
    localStorage.setItem('open-connections', JSON.stringify([connection.id]));
  }, [maria, user]);
  await page.reload();
  await page.waitForTimeout(1500);
  await page.locator('button[title="Load database list"]').first().dispatchEvent('mousedown');
  await page.waitForTimeout(1500);

  const folds = () => page.locator('.vertical-slider-fold:not(.unfolded)');
  const label = (name) => page.locator('.vertical-slider-label', {hasText: new RegExp(`^${name}$`)});
  check('nothing folded while no database is open', await folds().count() === 0 && await label('afold01').count() === 1 && await label('zfold15').count() === 1);

  await label('shop').first().click();
  await page.waitForTimeout(1500);
  const texts = await folds().allInnerTexts();
  check('closed databases above and below shop folded', texts.length === 2 && texts.every((text) => /⋯ \d+ databases/.test(text)) && await label('afold01').count() === 0 && await label('zfold15').count() === 0, JSON.stringify(texts));
  const list = await page.evaluate(() => {
    const ul = document.querySelector('.table-list-content > ul');
    return {height: ul.getBoundingClientRect().height, scroll: ul.scrollHeight, sidebar: document.querySelector('.resizable-column').clientHeight};
  });
  check('list of tables has the space - more than half of sidebar', list.height > list.sidebar * 0.5, JSON.stringify(list));
  check('fold row names its databases in title', /zfold01/.test(await folds().last().getAttribute('title')));
  await page.screenshot({path: `${OUT}/fold-01.png`});

  // unfold below, fold again
  await folds().last().click();
  await page.waitForTimeout(300);
  check('fold row opens its databases', await label('zfold15').count() === 1 && await page.locator('.vertical-slider-fold.unfolded').count() === 1);
  await page.locator('.vertical-slider-fold.unfolded').click();
  await page.waitForTimeout(300);
  check('databases can be folded again', await label('zfold15').count() === 0 && await folds().count() === 2);

  // other database opened from unfolded part - folding follows it
  await folds().last().click();
  await page.waitForTimeout(300);
  await label('zfold05').click();
  await page.waitForTimeout(1500);
  check('folding follows newly opened database', await label('zfold05').count() === 1 && await label('shop').count() === 0
    && await page.locator('.vertical-slider-fold.unfolded').count() === 0 && await folds().count() === 2, JSON.stringify(await folds().allInnerTexts()));
  await page.screenshot({path: `${OUT}/fold-02.png`});

  // closed database - all databases shown again
  await label('zfold05').click();
  await page.waitForTimeout(500);
  check('closing database shows all databases', await folds().count() === 0 && await label('shop').count() === 1 && await label('zfold15').count() === 1);

  check('no page errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})();
