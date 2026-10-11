// databases, create table, table options, more tables at once, maintenance, views, routines, triggers, events:
// node database-test.js <baseUrl>
const WebSocket = require('ws');
const BASE = process.argv[2] || 'http://php_flase:3001';

let failures = 0;
const check = (name, ok, info = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  -- ' + String(info).slice(0, 500) : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const col = (name, type, extra = {}) => ({
  name, type, nullable: true, defaultValue: {kind: 'none'}, autoIncrement: false, onUpdateCurrentTimestamp: false, comment: '', collation: null, ...extra,
});

const connect = async (connection, username, password) => {
  const user = await (await fetch(`${BASE}/api/login`, {method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({userData: {username, password}, connectionData: connection})})).json();
  const ws = new WebSocket(`${BASE.replace('http', 'ws')}/ws/${user.token}`);
  const messages = [];
  ws.on('message', (m) => messages.push(JSON.parse(m)));
  await new Promise((r) => ws.on('open', r));
  let seq = 0;
  const done = ['DATABASE_OPERATION_PREVIEW', 'DATABASE_OPERATION_APPLIED', 'DATABASE_OBJECTS', 'SERVER_OPTIONS', 'OBJECT_DDL',
    'TABLE_STRUCTURE', 'STRUCTURE_CHANGE_PREVIEW', 'STRUCTURE_CHANGE_APPLIED', 'QUERY_ERROR', 'QUERY_FINISHED'];
  const request = async (command, payload) => {
    const tabId = 'db' + (++seq);
    ws.send(JSON.stringify({connectionData: {user, connection}, command, payload: {...payload, tabId}}));
    for (let i = 0; i < 600; i++) {
      const m = messages.find((x) => x.payload?.tabId === tabId && done.includes(x.message));
      if (m) {
        await sleep(20);
        return {...m, error: m.message === 'QUERY_ERROR' ? m.payload.error : null,
          rows: messages.filter((x) => x.payload?.tabId === tabId && x.message === 'SINGLE_SELECT_RECORD').map((x) => x.payload.rowDataValue)};
      }
      await sleep(30);
    }
    return {error: 'timeout'};
  };
  return {
    ws,
    operation: (operation, dryRun = false) => request('DATABASE_OPERATION', {operation, dryRun}),
    objects: (database) => request('GET_DATABASE_OBJECTS', {database}),
    options: () => request('GET_SERVER_OPTIONS', {}),
    ddl: (database, object) => request('GET_OBJECT_DDL', {database, object}),
    change: (table, change, dryRun = false) => request('CHANGE_STRUCTURE', {table, change, dryRun}),
    structure: (table) => request('GET_TABLE_STRUCTURE', {table}),
    select: (query, database) => request('SEND_SELECT_QUERY', {query, database: {name: database}}),
  };
};

const mysqlTests = async (dsn) => {
  console.log(`\n=== ${dsn}`);
  const connection = {id: 'db-' + dsn, dsn, username: 'root', displayName: dsn, changeConfirmationRequired: false};
  const c = await connect(connection, 'root', 'root');
  const DB = 'flase_db_test';
  const DB2 = 'flase_db_test2';
  await c.operation({kind: 'dropDatabase', name: DB});
  await c.operation({kind: 'dropDatabase', name: DB2});

  // --- server options
  let r = await c.options();
  check('server options: collations and engines', r.payload?.collations?.some((x) => x.name === 'utf8mb4_bin' && x.charset === 'utf8mb4')
    && r.payload.engines.some((x) => x.name === 'InnoDB') && !!r.payload.defaultCollation, r.error || JSON.stringify(r.payload?.engines));

  // --- create database
  r = await c.operation({kind: 'createDatabase', name: DB, collation: 'utf8mb4_bin'}, true);
  check('create database preview', r.payload?.statements?.[0] === `CREATE DATABASE \`${DB}\` COLLATE utf8mb4_bin`, r.error || JSON.stringify(r.payload?.statements));
  r = await c.objects(DB);
  check('preview does not create database', !!r.error, r.error);
  r = await c.operation({kind: 'createDatabase', name: DB, collation: 'utf8mb4_bin'});
  check('database created', r.message === 'DATABASE_OPERATION_APPLIED', r.error);
  r = await c.objects(DB);
  check('objects of empty database', r.payload?.collation === 'utf8mb4_bin' && r.payload.tables.length === 0 && Array.isArray(r.payload.events), r.error || JSON.stringify(r.payload));
  r = await c.operation({kind: 'createDatabase', name: 'bad; x', collation: 'utf8mb4_bin; DROP'}, true);
  check('invalid collation refused', /invalid collation/i.test(r.error || ''), r.error);

  // --- create table
  const parent = {
    kind: 'createTable', database: DB, name: 'parent',
    columns: [
      col('id', 'int unsigned', {nullable: false, autoIncrement: true}),
      col('name', 'varchar(50)', {comment: "it's name"}),
      col('code', 'char(5)', {nullable: false, defaultValue: {kind: 'value', value: 'AB'}}),
    ],
    primaryKey: ['id'],
    indexes: [{name: 'idx_name', kind: 'INDEX', columns: ['name']}, {name: '', kind: 'UNIQUE', columns: ['code']}],
    engine: 'InnoDB', collation: 'utf8mb4_unicode_ci', comment: 'Parent table',
  };
  r = await c.operation(parent, true);
  check('create table preview', r.payload?.statements?.[0] === `CREATE TABLE \`${DB}\`.\`parent\` (\n`
    + "  `id` int unsigned NOT NULL AUTO_INCREMENT,\n  `name` varchar(50) NULL COMMENT 'it\\'s name',\n  `code` char(5) NOT NULL DEFAULT 'AB',\n"
    + "  PRIMARY KEY (`id`),\n  INDEX `idx_name` (`name`),\n  UNIQUE INDEX (`code`)\n)\nENGINE = InnoDB\nDEFAULT COLLATE = utf8mb4_unicode_ci\nCOMMENT = 'Parent table'",
  r.error || r.payload?.statements?.[0]);
  r = await c.operation(parent);
  check('table created', r.message === 'DATABASE_OPERATION_APPLIED', r.error);
  r = await c.operation({...parent, name: 'x', columns: [col('a', 'int'), col('A', 'int')]}, true);
  check('duplicate column refused', /more times/.test(r.error || ''), r.error);
  r = await c.operation({...parent, name: 'x', primaryKey: ['nope']}, true);
  check('unknown key column refused', /unknown column/.test(r.error || ''), r.error);
  r = await c.operation({kind: 'createTable', database: DB, name: 'child', primaryKey: ['id'], indexes: [],
    columns: [col('id', 'int', {nullable: false, autoIncrement: true}), col('parent_id', 'int unsigned')]});
  check('second table created', r.message === 'DATABASE_OPERATION_APPLIED', r.error);
  await c.select('ALTER TABLE child ADD CONSTRAINT fk_parent FOREIGN KEY (parent_id) REFERENCES parent (id)', DB);
  await c.select("INSERT INTO parent (name, code) VALUES ('a', 'A1'), ('b', 'B1')", DB);
  await c.select('INSERT INTO child (parent_id) VALUES (1)', DB);

  let s = (await c.structure({databaseName: DB, name: 'parent'})).payload;
  check('created table structure', s?.info?.comment === 'Parent table' && s.info.collation === 'utf8mb4_unicode_ci'
    && s.columns.find((x) => x.name === 'name')?.comment === "it's name" && s.indexes.length === 3, JSON.stringify(s?.info));

  // --- table options
  const table = {databaseName: DB, name: 'parent'};
  r = await c.change(table, {kind: 'options', autoIncrement: 100, comment: 'Changed', collation: 'utf8mb4_bin', convert: true}, true);
  check('table options preview', r.payload?.statements?.[0] === `ALTER TABLE \`${DB}\`.\`parent\`\n  CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_bin,\n  COMMENT = 'Changed',\n  AUTO_INCREMENT = 100`,
    r.error || r.payload?.statements?.[0]);
  r = await c.change(table, {kind: 'options', autoIncrement: 100, comment: 'Changed', collation: 'utf8mb4_bin', convert: true});
  check('table options applied', r.message === 'STRUCTURE_CHANGE_APPLIED', r.error);
  await c.select("INSERT INTO parent (name, code) VALUES ('c', 'C1')", DB);
  r = await c.select("SELECT id FROM parent WHERE code = 'C1'", DB);
  s = (await c.structure(table)).payload;
  check('auto increment and converted collation', String(r.rows[0]?.id) === '100' && s.columns.find((x) => x.name === 'name')?.collation === 'utf8mb4_bin' && s.info.comment === 'Changed',
    JSON.stringify(r.rows) + ' ' + s?.columns.find((x) => x.name === 'name')?.collation);
  r = await c.change(table, {kind: 'options', collation: 'utf8mb4_general_ci'}, true);
  check('default collation without convert', r.payload?.statements?.[0]?.endsWith('DEFAULT COLLATE utf8mb4_general_ci'), r.error || r.payload?.statements?.[0]);
  r = await c.change(table, {kind: 'options', engine: 'InnoDB; DROP'}, true);
  check('invalid engine refused', /invalid engine/i.test(r.error || ''), r.error);
  r = await c.change(table, {kind: 'options'}, true);
  check('empty options refused', /Nothing to change/.test(r.error || ''), r.error);

  // --- views
  r = await c.operation({kind: 'createView', database: DB, name: 'v_parent', select: 'SELECT id, name FROM parent WHERE code <> \';\';', replace: false}, true);
  check('create view preview', r.payload?.statements?.[0] === `CREATE VIEW \`${DB}\`.\`v_parent\` AS\nSELECT id, name FROM parent WHERE code <> ';'`, r.error || r.payload?.statements?.[0]);
  r = await c.operation({kind: 'createView', database: DB, name: 'v_parent', select: 'SELECT 1; DROP TABLE parent', replace: false}, true);
  check('second statement in view refused', /one statement/.test(r.error || ''), r.error);
  r = await c.operation({kind: 'createView', database: DB, name: 'v_parent', select: 'SELECT id, name FROM parent', replace: false});
  check('view created', r.message === 'DATABASE_OPERATION_APPLIED', r.error);

  // --- routines
  r = await c.operation({kind: 'objectDdl', database: DB, sql: 'CREATE PROCEDURE p_add(IN a INT, OUT b INT)\nBEGIN\n  SET b = a + 1;\nEND;'});
  check('procedure created (body with ;)', r.message === 'DATABASE_OPERATION_APPLIED', r.error);
  r = await c.operation({kind: 'objectDdl', database: DB, sql: 'CREATE FUNCTION f_twice(x INT) RETURNS INT DETERMINISTIC RETURN x * 2'});
  check('function created', r.message === 'DATABASE_OPERATION_APPLIED', r.error);
  r = await c.operation({kind: 'objectDdl', database: DB, sql: 'DELIMITER $$\nCREATE PROCEDURE x() BEGIN END$$'}, true);
  check('DELIMITER refused with explanation', /DELIMITER/.test(r.error || ''), r.error);
  r = await c.operation({kind: 'objectDdl', database: DB, sql: 'DROP TABLE parent'}, true);
  check('other statement than CREATE refused', /must start with CREATE/.test(r.error || ''), r.error);
  r = await c.select('SELECT f_twice(21) AS v', DB);
  check('function works', String(r.rows[0]?.v) === '42', r.error || JSON.stringify(r.rows));

  r = await c.objects(DB);
  const proc = r.payload?.routines?.find((x) => x.name === 'p_add');
  const fn = r.payload?.routines?.find((x) => x.name === 'f_twice');
  check('routines listed with parameters', proc?.kind === 'PROCEDURE' && JSON.stringify(proc.parameters).replace(/int\(11\)/g, 'int') === '[{"mode":"IN","name":"a","type":"int"},{"mode":"OUT","name":"b","type":"int"}]'
    && fn?.kind === 'FUNCTION' && /^int/.test(fn.returns) && fn.parameters[0]?.name === 'x' && fn.parameters[0].mode === 'IN', JSON.stringify(r.payload?.routines));
  check('tables and views listed', r.payload?.tables?.map((x) => `${x.name}:${x.isView}`).join() === 'child:false,parent:false,v_parent:true', JSON.stringify(r.payload?.tables?.map((x) => x.name)));

  r = await c.ddl(DB, {type: 'PROCEDURE', name: 'p_add'});
  check('procedure DDL', /CREATE .*PROCEDURE `p_add`/s.test(r.payload?.ddl || ''), r.error || r.payload?.ddl);
  const original = r.payload?.ddl;
  r = await c.operation({kind: 'objectDdl', database: DB, sql: 'CREATE PROCEDURE p_add(IN a INT, OUT b INT) BEGIN SET b = a +; END', replace: {type: 'PROCEDURE', name: 'p_add'}});
  check('broken replace reports error and restores', r.message === 'QUERY_ERROR' && /restored/.test(r.error), r.error);
  r = await c.ddl(DB, {type: 'PROCEDURE', name: 'p_add'});
  check('procedure still exists after failed replace', r.payload?.ddl === original, r.error || r.payload?.ddl);
  r = await c.operation({kind: 'objectDdl', database: DB, sql: 'CREATE PROCEDURE p_add(IN a INT, OUT b INT) BEGIN SET b = a + 2; END', replace: {type: 'PROCEDURE', name: 'p_add'}}, true);
  check('replace preview drops first', r.payload?.statements?.[0] === `DROP PROCEDURE IF EXISTS \`${DB}\`.\`p_add\``, r.error || JSON.stringify(r.payload?.statements));
  r = await c.operation({kind: 'objectDdl', database: DB, sql: 'CREATE PROCEDURE p_add(IN a INT, OUT b INT) BEGIN SET b = a + 2; END', replace: {type: 'PROCEDURE', name: 'p_add'}});
  check('procedure replaced', r.message === 'DATABASE_OPERATION_APPLIED' && /a \+ 2/.test((await c.ddl(DB, {type: 'PROCEDURE', name: 'p_add'})).payload?.ddl || ''), r.error);

  // --- trigger and event
  r = await c.operation({kind: 'objectDdl', database: DB, sql: 'CREATE TRIGGER trg_upper BEFORE INSERT ON parent FOR EACH ROW SET NEW.name = UPPER(NEW.name)'});
  check('trigger created', r.message === 'DATABASE_OPERATION_APPLIED', r.error);
  r = await c.operation({kind: 'objectDdl', database: DB, sql: 'CREATE EVENT ev_clean ON SCHEDULE EVERY 1 DAY DO DELETE FROM child WHERE id < 0'});
  check('event created', r.message === 'DATABASE_OPERATION_APPLIED', r.error);
  r = await c.objects(DB);
  check('trigger listed', JSON.stringify(r.payload?.triggers) === '[{"name":"trg_upper","table":"parent","timing":"BEFORE","event":"INSERT"}]', JSON.stringify(r.payload?.triggers));
  check('event listed', r.payload?.events?.[0]?.name === 'ev_clean' && /^EVERY 1 DAY/.test(r.payload.events[0].schedule) && r.payload.events[0].status === 'ENABLED' && !!r.payload.eventScheduler,
    JSON.stringify(r.payload?.events) + r.payload?.eventScheduler);
  r = await c.ddl(DB, {type: 'TRIGGER', name: 'trg_upper'});
  check('trigger DDL', /CREATE .*TRIGGER `?trg_upper/s.test(r.payload?.ddl || ''), r.error || r.payload?.ddl);
  r = await c.ddl(DB, {type: 'EVENT', name: 'ev_clean'});
  check('event DDL', /CREATE .*EVENT `ev_clean`/s.test(r.payload?.ddl || ''), r.error || r.payload?.ddl);

  // --- rename database refused while it has views / routines / triggers / events
  r = await c.operation({kind: 'renameDatabase', name: DB, newName: DB2}, true);
  check('rename with routines refused', /cannot move/.test(r.error || '') && /p_add/.test(r.error) && /trg_upper/.test(r.error), r.error);

  // --- drop objects
  for (const object of [{type: 'PROCEDURE', name: 'p_add'}, {type: 'FUNCTION', name: 'f_twice'}, {type: 'TRIGGER', name: 'trg_upper'}, {type: 'EVENT', name: 'ev_clean'}, {type: 'VIEW', name: 'v_parent'}]) {
    r = await c.operation({kind: 'dropObject', database: DB, object});
    check(`drop ${object.type.toLowerCase()}`, r.message === 'DATABASE_OPERATION_APPLIED' && r.payload.statements[0] === `DROP ${object.type} \`${DB}\`.\`${object.name}\``, r.error || JSON.stringify(r.payload?.statements));
  }
  r = await c.operation({kind: 'dropObject', database: DB, object: {type: 'TABLE', name: 'parent'}}, true);
  check('unknown object type refused', /Unknown object type/.test(r.error || ''), r.error);

  // --- maintenance
  r = await c.operation({kind: 'maintenance', action: 'optimize', database: DB, tables: ['parent', 'child']}, true);
  check('optimize preview', r.payload?.statements?.[0] === `OPTIMIZE TABLE \`${DB}\`.\`parent\`, \`${DB}\`.\`child\``, r.error || JSON.stringify(r.payload?.statements));
  for (const action of ['optimize', 'analyze', 'check', 'repair']) {
    r = await c.operation({kind: 'maintenance', action, database: DB, tables: ['parent', 'child']});
    check(`${action} returns messages`, r.message === 'DATABASE_OPERATION_APPLIED' && r.payload.results?.some((x) => x.table === `${DB}.parent`) && r.payload.results.every((x) => x.message),
      r.error || JSON.stringify(r.payload?.results));
  }
  r = await c.operation({kind: 'maintenance', action: 'vacuum', database: DB, tables: ['parent']}, true);
  check('vacuum not available', /not available/.test(r.error || ''), r.error);

  // --- more tables: truncate with foreign keys
  r = await c.operation({kind: 'tables', action: 'truncate', database: DB, tables: ['parent', 'child'], ignoreForeignKeys: false});
  check('truncate of referenced table fails without disabled checks', r.message === 'QUERY_ERROR', r.error);
  r = await c.operation({kind: 'tables', action: 'truncate', database: DB, tables: ['parent', 'child'], ignoreForeignKeys: true}, true);
  check('truncate preview with disabled checks', JSON.stringify(r.payload?.statements) === JSON.stringify(['SET FOREIGN_KEY_CHECKS = 0', `TRUNCATE TABLE \`${DB}\`.\`parent\``, `TRUNCATE TABLE \`${DB}\`.\`child\``, 'SET FOREIGN_KEY_CHECKS = 1']),
    r.error || JSON.stringify(r.payload?.statements));
  r = await c.operation({kind: 'tables', action: 'truncate', database: DB, tables: ['parent', 'child'], ignoreForeignKeys: true});
  const counts = await c.select('SELECT (SELECT COUNT(*) FROM parent) AS p, (SELECT COUNT(*) FROM child) AS c, @@FOREIGN_KEY_CHECKS AS fk', DB);
  check('tables truncated, checks enabled for other sessions', r.message === 'DATABASE_OPERATION_APPLIED' && counts.rows[0]?.p == 0 && counts.rows[0]?.c == 0 && counts.rows[0]?.fk == 1,
    r.error || JSON.stringify(counts.rows));
  r = await c.operation({kind: 'tables', action: 'drop', database: DB, tables: ['nope'], ignoreForeignKeys: false}, true);
  check('missing table refused', /does not exist/.test(r.error || ''), r.error);

  // --- rename database (only tables)
  r = await c.operation({kind: 'renameDatabase', name: DB, newName: DB2}, true);
  check('rename preview', JSON.stringify(r.payload?.statements) === JSON.stringify([
    `CREATE DATABASE \`${DB2}\` COLLATE utf8mb4_bin`,
    `RENAME TABLE\n  \`${DB}\`.\`child\` TO \`${DB2}\`.\`child\`,\n  \`${DB}\`.\`parent\` TO \`${DB2}\`.\`parent\``,
    `DROP DATABASE \`${DB}\``,
  ]), r.error || JSON.stringify(r.payload?.statements));
  r = await c.operation({kind: 'renameDatabase', name: DB, newName: DB2});
  check('database renamed', r.message === 'DATABASE_OPERATION_APPLIED', r.error);
  r = await c.objects(DB2);
  check('tables moved', r.payload?.tables?.map((x) => x.name).join() === 'child,parent' && r.payload.collation === 'utf8mb4_bin', r.error || JSON.stringify(r.payload?.tables));
  check('old database is gone', !!(await c.objects(DB)).error);

  // --- alter database
  r = await c.operation({kind: 'alterDatabase', name: DB2, collation: 'utf8mb4_unicode_ci', convertTables: true}, true);
  check('alter database preview converts tables', r.payload?.statements?.length === 3 && r.payload.statements[0] === `ALTER DATABASE \`${DB2}\` COLLATE utf8mb4_unicode_ci`
    && r.payload.statements[1] === `ALTER TABLE \`${DB2}\`.\`child\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`, r.error || JSON.stringify(r.payload?.statements));
  r = await c.operation({kind: 'alterDatabase', name: DB2, collation: 'utf8mb4_unicode_ci', convertTables: true});
  s = (await c.structure({databaseName: DB2, name: 'parent'})).payload;
  check('database and tables converted', r.message === 'DATABASE_OPERATION_APPLIED' && (await c.objects(DB2)).payload?.collation === 'utf8mb4_unicode_ci'
    && s.columns.find((x) => x.name === 'name')?.collation === 'utf8mb4_unicode_ci', r.error || s?.columns.find((x) => x.name === 'name')?.collation);

  // --- drop more tables, drop database
  r = await c.operation({kind: 'tables', action: 'drop', database: DB2, tables: ['parent', 'child'], ignoreForeignKeys: true});
  check('tables dropped', r.message === 'DATABASE_OPERATION_APPLIED' && (await c.objects(DB2)).payload?.tables?.length === 0, r.error);
  r = await c.operation({kind: 'dropDatabase', name: 'mysql'}, true);
  check('system database refused', /system database/.test(r.error || ''), r.error);
  r = await c.operation({kind: 'dropDatabase', name: DB2});
  check('database dropped', r.message === 'DATABASE_OPERATION_APPLIED' && !!(await c.objects(DB2)).error, r.error);

  // --- read only connection: preview allowed, change refused
  const readOnly = await connect({...connection, id: 'ro-' + dsn, readOnly: true}, 'root', 'root');
  r = await readOnly.operation({kind: 'createDatabase', name: DB}, true);
  check('read only: preview allowed', r.message === 'DATABASE_OPERATION_PREVIEW', r.error);
  r = await readOnly.operation({kind: 'createDatabase', name: DB});
  check('read only: change refused', /read only/i.test(r.error || '') && !!(await c.objects(DB)).error, r.error);
  readOnly.ws.close();
  c.ws.close();
};

const postgresTests = async () => {
  console.log('\n=== postgresql');
  const connection = {id: 'db-pg', dsn: 'postgresql://postgres:5432/shop', username: 'flase', displayName: 'pg', changeConfirmationRequired: false};
  const c = await connect(connection, 'flase', 'flase');
  const S = 'flase_schema_test';
  const S2 = 'flase_schema_test2';
  await c.operation({kind: 'dropDatabase', name: S});
  await c.operation({kind: 'dropDatabase', name: S2});

  let r = await c.options();
  check('server options empty', r.payload?.collations?.length === 0 && r.payload.engines.length === 0, r.error);
  r = await c.operation({kind: 'createDatabase', name: S});
  check('schema created', r.message === 'DATABASE_OPERATION_APPLIED' && r.payload.statements[0] === `CREATE SCHEMA "${S}"`, r.error);
  r = await c.operation({kind: 'alterDatabase', name: S, collation: 'C', convertTables: false}, true);
  check('collation of schema refused', /no collation/.test(r.error || ''), r.error);

  const parent = {
    kind: 'createTable', database: S, name: 'parent',
    columns: [col('id', 'integer', {nullable: false, autoIncrement: true}), col('name', 'varchar(50)', {comment: "it's name"}), col('code', 'char(5)', {nullable: false, defaultValue: {kind: 'value', value: 'AB'}})],
    primaryKey: ['id'], indexes: [{name: 'idx_name', kind: 'INDEX', columns: ['name']}, {name: 'uq_code', kind: 'UNIQUE', columns: ['code']}], comment: 'Parent table',
  };
  r = await c.operation(parent, true);
  check('create table preview', JSON.stringify(r.payload?.statements) === JSON.stringify([
    `CREATE TABLE "${S}"."parent" (\n  "id" integer GENERATED BY DEFAULT AS IDENTITY NOT NULL,\n  "name" varchar(50) NULL,\n  "code" char(5) DEFAULT 'AB' NOT NULL,\n  PRIMARY KEY ("id"),\n  CONSTRAINT "uq_code" UNIQUE ("code")\n)`,
    `CREATE INDEX "idx_name" ON "${S}"."parent" ("name")`,
    `COMMENT ON TABLE "${S}"."parent" IS 'Parent table'`,
    `COMMENT ON COLUMN "${S}"."parent"."name" IS 'it''s name'`,
  ]), r.error || JSON.stringify(r.payload?.statements));
  r = await c.operation(parent);
  check('table created', r.message === 'DATABASE_OPERATION_APPLIED', r.error);
  r = await c.operation({...parent, name: 'x', indexes: [{name: '', kind: 'FULLTEXT', columns: ['name']}]}, true);
  check('fulltext refused', /FULLTEXT/.test(r.error || ''), r.error);
  r = await c.operation({kind: 'createTable', database: S, name: 'child', primaryKey: ['id'], indexes: [],
    columns: [col('id', 'integer', {nullable: false, autoIncrement: true}), col('parent_id', 'integer')]});
  await c.select(`ALTER TABLE "${S}".child ADD CONSTRAINT fk_parent FOREIGN KEY (parent_id) REFERENCES "${S}".parent (id)`, S);
  await c.select("INSERT INTO parent (name, code) VALUES ('a', 'A1'), ('b', 'B1')", S);
  await c.select('INSERT INTO child (parent_id) VALUES (1)', S);
  let s = (await c.structure({databaseName: S, name: 'parent'})).payload;
  check('created table structure', s?.info?.comment === 'Parent table' && s.columns.find((x) => x.name === 'name')?.comment === "it's name" && s.indexes.length === 3, JSON.stringify(s?.indexes?.map((x) => x.name)));

  // --- table options
  const table = {databaseName: S, name: 'parent'};
  r = await c.change(table, {kind: 'options', autoIncrement: 100, comment: 'Changed'}, true);
  check('options preview', JSON.stringify(r.payload?.statements) === JSON.stringify([`COMMENT ON TABLE "${S}"."parent" IS 'Changed'`, `SELECT setval('${S}.parent_id_seq', 100, false)`]), r.error || JSON.stringify(r.payload?.statements));
  r = await c.change(table, {kind: 'options', autoIncrement: 100, comment: 'Changed'});
  await c.select("INSERT INTO parent (name, code) VALUES ('c', 'C1')", S);
  r = await c.select("SELECT id FROM parent WHERE code = 'C1'", S);
  check('next identity value set', String(r.rows[0]?.id) === '100', r.error || JSON.stringify(r.rows));
  r = await c.change(table, {kind: 'options', engine: 'heap'}, true);
  check('engine refused', /no storage engines/.test(r.error || ''), r.error);

  // --- view, functions, procedures, triggers
  r = await c.operation({kind: 'createView', database: S, name: 'v_parent', select: 'SELECT id, name FROM parent', replace: false});
  check('view created', r.message === 'DATABASE_OPERATION_APPLIED', r.error);
  r = await c.operation({kind: 'objectDdl', database: S, sql: "CREATE FUNCTION f_twice(x integer) RETURNS integer LANGUAGE sql AS $$ SELECT x * 2; $$;"});
  check('function created in schema (dollar quoted body)', r.message === 'DATABASE_OPERATION_APPLIED', r.error);
  r = await c.operation({kind: 'objectDdl', database: S, sql: 'CREATE FUNCTION f_twice(x text) RETURNS text LANGUAGE sql AS $$ SELECT x || x $$'});
  check('overloaded function created', r.message === 'DATABASE_OPERATION_APPLIED', r.error);
  r = await c.operation({kind: 'objectDdl', database: S, sql: 'CREATE PROCEDURE p_log(IN msg text, INOUT n integer) LANGUAGE plpgsql AS $$ BEGIN n := n + 1; END $$'});
  check('procedure created', r.message === 'DATABASE_OPERATION_APPLIED', r.error);
  r = await c.operation({kind: 'objectDdl', database: S, sql: 'CREATE FUNCTION trg_upper() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.name := upper(NEW.name); RETURN NEW; END $$'});
  r = await c.operation({kind: 'objectDdl', database: S, sql: 'CREATE TRIGGER upper_name BEFORE INSERT ON parent FOR EACH ROW EXECUTE FUNCTION trg_upper()'});
  check('trigger created', r.message === 'DATABASE_OPERATION_APPLIED', r.error);
  r = await c.select(`SELECT "${S}".f_twice(21) AS a, "${S}".f_twice('ab') AS b`, S);
  check('functions work', String(r.rows[0]?.a) === '42' && r.rows[0]?.b === 'abab', r.error || JSON.stringify(r.rows));

  r = await c.objects(S);
  const fns = (r.payload?.routines || []).filter((x) => x.name === 'f_twice');
  const proc = r.payload?.routines?.find((x) => x.name === 'p_log');
  check('overloads listed with signatures', fns.map((x) => x.signature).sort().join('|') === 'x integer|x text' && fns.every((x) => x.kind === 'FUNCTION' && x.returns), JSON.stringify(fns));
  check('procedure parameters with modes', proc?.kind === 'PROCEDURE' && JSON.stringify(proc.parameters) === '[{"mode":"IN","name":"msg","type":"text"},{"mode":"INOUT","name":"n","type":"integer"}]', JSON.stringify(proc));
  check('trigger listed', r.payload?.triggers?.some((x) => x.name === 'upper_name' && x.table === 'parent' && x.timing === 'BEFORE' && x.event === 'INSERT'), JSON.stringify(r.payload?.triggers));
  check('tables, views, no events', r.payload?.tables?.map((x) => `${x.name}:${x.isView}`).join() === 'child:false,parent:false,v_parent:true' && r.payload.events === null, JSON.stringify(r.payload?.tables));

  r = await c.ddl(S, {type: 'FUNCTION', name: 'f_twice', signature: 'x text'});
  check('function DDL of overload', /CREATE OR REPLACE FUNCTION .*f_twice\(x text\)/s.test(r.payload?.ddl || ''), r.error || r.payload?.ddl);
  r = await c.operation({kind: 'objectDdl', database: S, sql: r.payload.ddl.replace('x || x', 'x || x || x'), replace: {type: 'FUNCTION', name: 'f_twice', signature: 'x text'}}, true);
  check('CREATE OR REPLACE of function does not drop it', r.payload?.statements?.length === 1, r.error || JSON.stringify(r.payload?.statements));
  r = await c.ddl(S, {type: 'TRIGGER', name: 'upper_name', table: 'parent'});
  r = await c.operation({kind: 'objectDdl', database: S, sql: r.payload.ddl.replace('BEFORE INSERT', 'BEFORE INSERT OR UPDATE'), replace: {type: 'TRIGGER', name: 'upper_name', table: 'parent'}});
  check('trigger replaced in one transaction', r.message === 'DATABASE_OPERATION_APPLIED' && r.payload.statements[0] === `DROP TRIGGER "upper_name" ON "${S}"."parent"`, r.error || JSON.stringify(r.payload?.statements));
  r = await c.operation({kind: 'objectDdl', database: S, sql: 'CREATE TRIGGER upper_name BEFORE INSERT ON parent FOR EACH ROW EXECUTE FUNCTION nope()', replace: {type: 'TRIGGER', name: 'upper_name', table: 'parent'}});
  check('broken replace leaves trigger', r.message === 'QUERY_ERROR' && (await c.objects(S)).payload?.triggers?.some((x) => x.name === 'upper_name' && /UPDATE/.test(x.event)), r.error);
  r = await c.ddl(S, {type: 'VIEW', name: 'v_parent'});
  check('view DDL', /CREATE OR REPLACE VIEW "v_parent" AS/.test(r.payload?.ddl || ''), r.error || r.payload?.ddl);

  for (const object of [{type: 'FUNCTION', name: 'f_twice', signature: 'x integer'}, {type: 'PROCEDURE', name: 'p_log', signature: 'IN msg text, INOUT n integer'}, {type: 'TRIGGER', name: 'upper_name', table: 'parent'}, {type: 'VIEW', name: 'v_parent'}]) {
    r = await c.operation({kind: 'dropObject', database: S, object});
    check(`drop ${object.type.toLowerCase()}`, r.message === 'DATABASE_OPERATION_APPLIED', r.error || JSON.stringify(r.payload?.statements));
  }
  r = await c.objects(S);
  check('other overload stays', r.payload?.routines?.map((x) => `${x.name}(${x.signature})`).sort().join() === 'f_twice(x text),trg_upper()', JSON.stringify(r.payload?.routines?.map((x) => x.signature)));

  // --- maintenance (outside transaction)
  for (const action of ['vacuum', 'vacuumFull', 'vacuumAnalyze', 'analyze', 'reindex']) {
    r = await c.operation({kind: 'maintenance', action, database: S, tables: ['parent', 'child']});
    check(`${action} for each table`, r.message === 'DATABASE_OPERATION_APPLIED' && r.payload.results?.length === 2 && r.payload.results.every((x) => x.type === 'status'), r.error || JSON.stringify(r.payload?.results));
  }
  r = await c.operation({kind: 'maintenance', action: 'optimize', database: S, tables: ['parent']}, true);
  check('optimize not available', /not available/.test(r.error || ''), r.error);

  // --- more tables
  r = await c.operation({kind: 'tables', action: 'truncate', database: S, tables: ['parent'], ignoreForeignKeys: false});
  check('truncate of referenced table fails without cascade', r.message === 'QUERY_ERROR', r.error);
  r = await c.operation({kind: 'tables', action: 'truncate', database: S, tables: ['parent', 'child'], ignoreForeignKeys: false});
  check('truncate of both tables at once', r.message === 'DATABASE_OPERATION_APPLIED' && r.payload.statements[0] === `TRUNCATE TABLE "${S}"."parent", "${S}"."child" RESTART IDENTITY`, r.error || JSON.stringify(r.payload?.statements));

  // --- rename, drop
  r = await c.operation({kind: 'renameDatabase', name: S, newName: S2});
  check('schema renamed', r.message === 'DATABASE_OPERATION_APPLIED' && (await c.objects(S2)).payload?.tables?.length === 2, r.error);
  r = await c.operation({kind: 'tables', action: 'drop', database: S2, tables: ['parent'], ignoreForeignKeys: true}, true);
  check('drop with cascade preview', r.payload?.statements?.[0] === `DROP TABLE "${S2}"."parent" CASCADE`, r.error || JSON.stringify(r.payload?.statements));
  r = await c.operation({kind: 'dropDatabase', name: 'pg_catalog'}, true);
  check('system schema refused', /system schema/.test(r.error || ''), r.error);
  r = await c.operation({kind: 'dropDatabase', name: S2});
  check('schema dropped with content', r.message === 'DATABASE_OPERATION_APPLIED' && r.payload.statements[0] === `DROP SCHEMA "${S2}" CASCADE` && !!(await c.objects(S2)).error, r.error);
  c.ws.close();
};

(async () => {
  await mysqlTests('mysql://mariadb');
  await mysqlTests('mysql://mysql');
  await postgresTests();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
