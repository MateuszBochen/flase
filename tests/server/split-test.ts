
import StreamingSqlSplitter from '../../server/src/App/Transfer/StreamingSqlSplitter';
let failures = 0;
const check = (name: string, ok: boolean, info: any = '') => { if (!ok) failures++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : ' -- ' + JSON.stringify(info))); };
const split = (text: string, size: number, dialect: any = 'mysql') => { const s = new StreamingSqlSplitter(dialect); const out: string[] = []; for (let i = 0; i < text.length; i += size) out.push(...s.push(text.slice(i, i + size))); out.push(...s.end()); return out; };
const script = [
  "SET NAMES utf8mb4;",
  "-- comment; here",
  "INSERT INTO t VALUES ('a;b', 'it\\'s', 'x''y;', '\\\\'), (\"q;\", `c;d`);",
  "/* block; */ SELECT 1 # c;",
  ";",
  "DELIMITER ;;",
  "CREATE TRIGGER x BEFORE INSERT ON t FOR EACH ROW BEGIN SET NEW.a = 1; SET NEW.b = 2; END;;",
  "DELIMITER ;",
  "SELECT 2;SELECT 3",
].join("\n");
const expected = [
  "SET NAMES utf8mb4",
  "-- comment; here\nINSERT INTO t VALUES ('a;b', 'it\\'s', 'x''y;', '\\\\'), (\"q;\", `c;d`)",
  "/* block; */ SELECT 1 # c;",
  "CREATE TRIGGER x BEFORE INSERT ON t FOR EACH ROW BEGIN SET NEW.a = 1; SET NEW.b = 2; END",
  "SELECT 2",
  "SELECT 3",
];
const whole = split(script, 100000);
check('statements', JSON.stringify(whole) === JSON.stringify(expected), whole);
for (const size of [1, 2, 3, 4, 7, 13, 64]) {
  const parts = split(script, size);
  check('chunk size ' + size, JSON.stringify(parts) === JSON.stringify(expected), parts);
}
check('comment only script', split('-- nothing\n/* x */', 3).length === 0);
const pgScript = [
  "SET search_path TO shop;",
  "INSERT INTO t VALUES ('C:\\', 'x''y;', E'it\\'s;', \"q;\"\"x\");",
  "--no space comment; here",
  "/* outer /* inner; */ still; */ SELECT 1;",
  "CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$",
  "BEGIN",
  "  NEW.code := upper(NEW.code); -- ;",
  "  RETURN NEW;",
  "END;",
  "$$;",
  "DO $body$ BEGIN PERFORM 'a$$b;'; END $body$;",
  "SELECT $1, a$b$ FROM x; SELECT '#not comment;' # 2",
].join("\n");
const pgExpected = [
  "SET search_path TO shop",
  "INSERT INTO t VALUES ('C:\\', 'x''y;', E'it\\'s;', \"q;\"\"x\")",
  "--no space comment; here\n/* outer /* inner; */ still; */ SELECT 1",
  "CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $$\nBEGIN\n  NEW.code := upper(NEW.code); -- ;\n  RETURN NEW;\nEND;\n$$",
  "DO $body$ BEGIN PERFORM 'a$$b;'; END $body$",
  "SELECT $1, a$b$ FROM x",
  "SELECT '#not comment;' # 2",
];
for (const size of [100000, 1, 2, 3, 5, 8, 17]) {
  const parts = split(pgScript, size, 'postgresql');
  check('postgresql chunk size ' + size, JSON.stringify(parts) === JSON.stringify(pgExpected), parts);
}
console.log(failures ? failures + ' FAILED' : 'ALL PASSED');
