const WebSocket = require('ws');
const BASE = 'http://php_flase:3001';
let failures = 0;
const check = (name, ok, info = '') => { if (!ok) failures++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + info : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  for (const dsn of ['mysql://mariadb', 'mysql://mysql']) {
    console.log(`\n=== ${dsn}`);
    const connection = {id: 'q-' + dsn, dsn, username: 'flase', displayName: dsn, changeConfirmationRequired: false};
    const user = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({userData: {username: 'flase', password: 'flase'}, connectionData: connection})})).json();
    const ws = new WebSocket(`ws://php_flase:3001/ws/${user.token}`);
    const messages = [];
    ws.on('message', (m) => messages.push(JSON.parse(m)));
    await new Promise((r) => ws.on('open', r));
    let seq = 0;
    const search = async (term, mode = 'contains', database = 'shop') => {
      const tabId = 's' + (++seq);
      ws.send(JSON.stringify({connectionData: {user, connection}, command: 'SEARCH_DATABASE', payload: {tabId, database: {name: database}, term, mode}}));
      for (let i = 0; i < 300; i++) {
        const done = messages.find((m) => m.payload?.tabId === tabId && ['DATABASE_SEARCH_FINISHED', 'QUERY_ERROR'].includes(m.message));
        if (done) return {done, results: messages.filter((m) => m.payload?.tabId === tabId && m.message === 'DATABASE_SEARCH_RESULT').map((m) => m.payload)};
        await sleep(30);
      }
      return {};
    };
    let r = await search('Krakow');
    const customers = r.results.find((x) => x.table === 'customers');
    check('finished', r.done.message === 'DATABASE_SEARCH_FINISHED' && r.done.payload.tables >= 10 && r.done.payload.warnings.length === 0, JSON.stringify(r.done.payload));
    check('customers.city matches', customers && customers.columns.some((c) => c.name === 'city' && c.rows === customers.rows) && customers.rows > 0, JSON.stringify(customers));
    check('value_test JSON matches', r.results.some((x) => x.table === 'value_test' && x.columns.some((c) => c.name === 'doc')), JSON.stringify(r.results.map((x) => x.table)));
    check('blob not searched', !r.results.some((x) => x.columns.some((c) => c.name === 'data')));
    r = await search('user1@example.com', 'exact');
    check('exact match only in text column', r.results.length === 1 && r.results[0].table === 'customers' && r.results[0].rows === 1 && r.done.payload.warnings.length === 0, JSON.stringify(r.results) + JSON.stringify(r.done.payload.warnings));
    r = await search('2026-01-02', 'contains');
    check('date columns searched as text', r.results.some((x) => x.columns.some((c) => c.name === 'created')) && r.done.payload.warnings.length === 0, JSON.stringify(r.results.map((x) => x.table)));
    r = await search('9007199254740993', 'exact');
    check('bigint exact as text', r.results.some((x) => x.table === 'edit_test'), JSON.stringify(r.results));
    r = await search('_');
    const underscoreTables = r.results.map((x) => x.table);
    r = await search('%');
    check('% and _ are literal', r.results.length === 0 && !underscoreTables.includes('categories'), `% -> ${r.results.length}, _ -> ${underscoreTables}`);
    r = await search("it's");
    check('apostrophe in term', r.results.some((x) => x.table === 'struct_test'), JSON.stringify(r.results.map((x) => x.table)));
    r = await search('');
    check('empty term refused', r.done.message === 'QUERY_ERROR');
    ws.close();
    await fetch(`${BASE}/api/disconnect`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({token: user.token})});
  }
  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}`);
  process.exit(failures ? 1 : 0);
})();
