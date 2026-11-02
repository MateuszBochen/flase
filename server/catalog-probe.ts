import {Client} from 'pg';
import PostgresCatalog from './src/App/Driver/Drivers/Postgres/PostgresCatalog';
(async () => {
  const client = new Client({host: process.argv[2], port: Number(process.argv[3]), user: process.argv[4], password: 'flase', database: 'shop'});
  await client.connect();
  const catalog = new PostgresCatalog(client as any);
  const s = 'public', t = 'eng_test';
  const calls: [string, () => Promise<any>][] = [
    ['relations', () => catalog.relations(s)], ['columns', () => catalog.columns(s, [t])], ['primaryKeys', () => catalog.primaryKeys(s, [t])],
    ['foreignKeys', () => catalog.foreignKeys(s, 'eng_child')], ['foreignKeys referencing', () => catalog.foreignKeys(s, t, true)],
    ['indexes', () => catalog.indexes(s, t)], ['triggers', () => catalog.triggers(s, t)], ['tableInfo', () => catalog.tableInfo(s, t)],
    ['structureColumns', () => catalog.structureColumns(s, t)], ['createTable', () => catalog.createTable(s, t, {foreignKeys: true, serial: true})],
    ['constraints', () => catalog.constraints(s, 'eng_child')], ['comments', () => catalog.comments(s, t, 'r')], ['createView', () => catalog.createView(s, 'eng_view', 'v')],
    ['ddl', () => catalog.ddl(s, t)],
  ];
  for (const [name, call] of calls) {
    try { const r = await call(); console.log('OK  ', name, JSON.stringify(r).slice(0, 160)); } catch (e: any) { console.log('FAIL', name, e.message); }
  }
  await client.end();
})();
