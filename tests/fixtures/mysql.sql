-- views left by interrupted browser tests
DROP VIEW IF EXISTS v_city_orders, v_expensive;
SET FOREIGN_KEY_CHECKS = 0;
DROP VIEW IF EXISTS struct_view;
DROP TABLE IF EXISTS struct_child;
DROP TABLE IF EXISTS struct_test;
CREATE TABLE struct_test (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(20) NOT NULL COMMENT 'business code',
  customer_id INT UNSIGNED NULL,
  status ENUM('a','b') NOT NULL DEFAULT 'a',
  title VARCHAR(200) NULL DEFAULT 'it''s untitled',
  created DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_x2 DECIMAL(11,2) AS (total * 2) VIRTUAL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_code (code),
  KEY idx_title_status (title(10), status),
  CONSTRAINT fk_struct_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB COMMENT='structure test';
CREATE TABLE struct_child (id INT PRIMARY KEY, struct_id INT UNSIGNED NOT NULL, CONSTRAINT fk_child_struct FOREIGN KEY (struct_id) REFERENCES struct_test (id));
CREATE DEFINER=`flase`@`%` TRIGGER trg_struct_code BEFORE INSERT ON struct_test FOR EACH ROW SET NEW.code = UPPER(NEW.code);
CREATE DEFINER=`flase`@`%` VIEW struct_view AS SELECT id, code FROM struct_test;
INSERT INTO struct_test (code, total, created) VALUES ('x1', 5, '2026-10-07 18:14:05'), ('x2', 7, '2026-10-07 18:14:05');
INSERT INTO struct_child VALUES (1, 1), (2, 2);
TRUNCATE edit_test;
INSERT INTO edit_test (name, note, big, price) VALUES ('a', NULL, 9007199254740993, 1.10), ('b', 'x', NULL, NULL), ('c', 'y', NULL, NULL);
TRUNCATE edit_nopk;
INSERT INTO edit_nopk VALUES (1, 'x'), (1, 'x'), (NULL, 'n');
DROP TABLE IF EXISTS value_test;
CREATE TABLE value_test (id INT AUTO_INCREMENT PRIMARY KEY, doc JSON NULL, body TEXT NULL, data BLOB NULL, bin VARBINARY(16) NULL);
INSERT INTO value_test (doc, body, data, bin) VALUES
 ('{"name":"Anna","tags":["a","b"],"address":{"city":"Krakow","zip":"30-001"}}', REPEAT('Lorem ipsum dolor sit amet. ', 40), 'plain text in blob', UNHEX('00FF10A0')),
 ('[1,2,3]', CONCAT('line 1', CHAR(10), 'line 2'), UNHEX(REPEAT('DEADBEEF', 600)), NULL);
DROP TABLE IF EXISTS csv_target;
SET FOREIGN_KEY_CHECKS = 1;

-- wide table for render performance (50 columns, 1000 rows)
DROP TABLE IF EXISTS wide_test;
CREATE TABLE wide_test (id INT AUTO_INCREMENT PRIMARY KEY,
  c01 VARCHAR(64) NULL,
  c02 DECIMAL(10,2) NULL,
  c03 DATETIME NULL,
  c04 TEXT NULL,
  c05 INT NULL,
  c06 VARCHAR(64) NULL,
  c07 DECIMAL(10,2) NULL,
  c08 DATETIME NULL,
  c09 TEXT NULL,
  c10 INT NULL,
  c11 VARCHAR(64) NULL,
  c12 DECIMAL(10,2) NULL,
  c13 DATETIME NULL,
  c14 TEXT NULL,
  c15 INT NULL,
  c16 VARCHAR(64) NULL,
  c17 DECIMAL(10,2) NULL,
  c18 DATETIME NULL,
  c19 TEXT NULL,
  c20 INT NULL,
  c21 VARCHAR(64) NULL,
  c22 DECIMAL(10,2) NULL,
  c23 DATETIME NULL,
  c24 TEXT NULL,
  c25 INT NULL,
  c26 VARCHAR(64) NULL,
  c27 DECIMAL(10,2) NULL,
  c28 DATETIME NULL,
  c29 TEXT NULL,
  c30 INT NULL,
  c31 VARCHAR(64) NULL,
  c32 DECIMAL(10,2) NULL,
  c33 DATETIME NULL,
  c34 TEXT NULL,
  c35 INT NULL,
  c36 VARCHAR(64) NULL,
  c37 DECIMAL(10,2) NULL,
  c38 DATETIME NULL,
  c39 TEXT NULL,
  c40 INT NULL,
  c41 VARCHAR(64) NULL,
  c42 DECIMAL(10,2) NULL,
  c43 DATETIME NULL,
  c44 TEXT NULL,
  c45 INT NULL,
  c46 VARCHAR(64) NULL,
  c47 DECIMAL(10,2) NULL,
  c48 DATETIME NULL,
  c49 TEXT NULL
);
INSERT INTO wide_test (c01, c02, c03, c04, c05, c06, c07, c08, c09, c10, c11, c12, c13, c14, c15, c16, c17, c18, c19, c20, c21, c22, c23, c24, c25, c26, c27, c28, c29, c30, c31, c32, c33, c34, c35, c36, c37, c38, c39, c40, c41, c42, c43, c44, c45, c46, c47, c48, c49)
SELECT CONCAT('text value 1 row ', seq.n), seq.n * 1.25 + 2, TIMESTAMPADD(MINUTE, seq.n * 3, '2026-01-01 00:00:00'), CONCAT('longer text of column 4 for row ', seq.n, ' lorem ipsum dolor sit amet'), seq.n * 5, CONCAT('text value 6 row ', seq.n), seq.n * 1.25 + 7, TIMESTAMPADD(MINUTE, seq.n * 8, '2026-01-01 00:00:00'), CONCAT('longer text of column 9 for row ', seq.n, ' lorem ipsum dolor sit amet'), seq.n * 10, CONCAT('text value 11 row ', seq.n), seq.n * 1.25 + 12, TIMESTAMPADD(MINUTE, seq.n * 13, '2026-01-01 00:00:00'), CONCAT('longer text of column 14 for row ', seq.n, ' lorem ipsum dolor sit amet'), seq.n * 15, CONCAT('text value 16 row ', seq.n), seq.n * 1.25 + 17, TIMESTAMPADD(MINUTE, seq.n * 18, '2026-01-01 00:00:00'), CONCAT('longer text of column 19 for row ', seq.n, ' lorem ipsum dolor sit amet'), seq.n * 20, CONCAT('text value 21 row ', seq.n), seq.n * 1.25 + 22, TIMESTAMPADD(MINUTE, seq.n * 23, '2026-01-01 00:00:00'), CONCAT('longer text of column 24 for row ', seq.n, ' lorem ipsum dolor sit amet'), seq.n * 25, CONCAT('text value 26 row ', seq.n), seq.n * 1.25 + 27, TIMESTAMPADD(MINUTE, seq.n * 28, '2026-01-01 00:00:00'), CONCAT('longer text of column 29 for row ', seq.n, ' lorem ipsum dolor sit amet'), seq.n * 30, CONCAT('text value 31 row ', seq.n), seq.n * 1.25 + 32, TIMESTAMPADD(MINUTE, seq.n * 33, '2026-01-01 00:00:00'), CONCAT('longer text of column 34 for row ', seq.n, ' lorem ipsum dolor sit amet'), seq.n * 35, CONCAT('text value 36 row ', seq.n), seq.n * 1.25 + 37, TIMESTAMPADD(MINUTE, seq.n * 38, '2026-01-01 00:00:00'), CONCAT('longer text of column 39 for row ', seq.n, ' lorem ipsum dolor sit amet'), seq.n * 40, CONCAT('text value 41 row ', seq.n), seq.n * 1.25 + 42, TIMESTAMPADD(MINUTE, seq.n * 43, '2026-01-01 00:00:00'), CONCAT('longer text of column 44 for row ', seq.n, ' lorem ipsum dolor sit amet'), seq.n * 45, CONCAT('text value 46 row ', seq.n), seq.n * 1.25 + 47, TIMESTAMPADD(MINUTE, seq.n * 48, '2026-01-01 00:00:00'), CONCAT('longer text of column 49 for row ', seq.n, ' lorem ipsum dolor sit amet')
FROM (SELECT a.d + b.d * 10 + c.d * 100 + 1 AS n FROM
  (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a,
  (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b,
  (SELECT 0 d UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c) seq
ORDER BY seq.n;

-- UUID as primary key: CHAR(36) with foreign key and BINARY(16) (MySQL and MariaDB)
DROP TABLE IF EXISTS uuid_orders;
DROP TABLE IF EXISTS uuid_customers;
DROP TABLE IF EXISTS uuid_bin_notes;
DROP TABLE IF EXISTS uuid_bin_test;
CREATE TABLE uuid_customers (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NULL,
  PRIMARY KEY (id)
);
CREATE TABLE uuid_orders (
  id CHAR(36) NOT NULL DEFAULT (UUID()),
  customer_id CHAR(36) NOT NULL,
  total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created DATETIME NOT NULL DEFAULT '2026-01-02 03:04:05',
  PRIMARY KEY (id),
  KEY idx_uuid_orders_customer (customer_id),
  CONSTRAINT fk_uuid_orders_customer FOREIGN KEY (customer_id) REFERENCES uuid_customers (id)
);
INSERT INTO uuid_customers (id, name, email) VALUES
  ('3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01', 'Anna', 'anna@example.com'),
  ('7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c02', 'Piotr', 'piotr@example.com'),
  ('b1c2d3e4-f5a6-4b7c-9d8e-0f1a2b3c4d03', 'Marta', NULL);
INSERT INTO uuid_orders (id, customer_id, total) VALUES
  ('d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f11', '3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01', 120.50),
  ('e5f6a7b8-c9d0-4e1f-9a2b-3c4d5e6f7a12', '3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01', 15.00),
  ('f6a7b8c9-d0e1-4f2a-8b3c-4d5e6f7a8b13', '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c02', 99.99);
CREATE TABLE uuid_bin_test (
  id BINARY(16) NOT NULL DEFAULT (UNHEX(REPLACE(UUID(), '-', ''))),
  name VARCHAR(100) NOT NULL,
  PRIMARY KEY (id)
);
INSERT INTO uuid_bin_test (id, name) VALUES
  (UNHEX('3F2C1A9E6B7D4E8F9A0B1C2D3E4F5A01'), 'first'),
  (UNHEX('7A8B9C0D1E2F4A3B8C4D5E6F7A8B9C02'), 'second');
-- rows referencing BINARY(16) UUID key - foreign key navigation and display of referenced row
CREATE TABLE uuid_bin_notes (
  id INT NOT NULL AUTO_INCREMENT,
  item_id BINARY(16) NOT NULL,
  note VARCHAR(200) NOT NULL,
  created DATETIME NOT NULL DEFAULT '2026-01-02 03:04:05',
  PRIMARY KEY (id),
  KEY idx_uuid_bin_notes_item (item_id),
  CONSTRAINT fk_uuid_bin_notes_item FOREIGN KEY (item_id) REFERENCES uuid_bin_test (id)
);
INSERT INTO uuid_bin_notes (item_id, note) VALUES
  (UNHEX('3F2C1A9E6B7D4E8F9A0B1C2D3E4F5A01'), 'first note of first'),
  (UNHEX('3F2C1A9E6B7D4E8F9A0B1C2D3E4F5A01'), 'second note of first'),
  (UNHEX('7A8B9C0D1E2F4A3B8C4D5E6F7A8B9C02'), 'note of second');
-- BINARY(16) without UUID default: MD5 hashes (not UUID), UUID v4, UUID v1 of UUID_TO_BIN(uuid, 1)
DROP TABLE IF EXISTS bin16_test;
CREATE TABLE bin16_test (
  id INT PRIMARY KEY,
  hash BINARY(16) NULL,
  ref BINARY(16) NULL,
  legacy BINARY(16) NULL
);
INSERT INTO bin16_test (id, hash, ref, legacy) VALUES
  (1, UNHEX(MD5('alpha')), UNHEX('3F2C1A9E6B7D4E8F9A0B1C2D3E4F5A01'), UNHEX('1026BABA6CCD780C95645B8C656024DB')),
  (2, UNHEX(MD5('beta')), UNHEX('7A8B9C0D1E2F4A3B8C4D5E6F7A8B9C02'), UNHEX('1026BABA6CCD780D95645B8C656024DB')),
  (3, UNHEX(MD5('gamma')), NULL, UNHEX('1026BABA6CCD780E95645B8C656024DB')),
  (4, UNHEX(MD5('delta')), UNHEX('B1C2D3E4F5A64B7C9D8E0F1A2B3C4D03'), UNHEX('1026BABA6CCD780F95645B8C656024DB'));
-- spatial values for map of results
DROP TABLE IF EXISTS gis_test;
CREATE TABLE gis_test (
  id INT PRIMARY KEY,
  name VARCHAR(50) NOT NULL,
  population INT NOT NULL,
  location POINT NULL,
  area POLYGON NULL,
  route LINESTRING NULL
);
INSERT INTO gis_test VALUES
  (1, 'Warszawa', 1860000, ST_GeomFromText('POINT(21.0122 52.2297)'), ST_GeomFromText('POLYGON((20.85 52.10, 21.27 52.10, 21.27 52.37, 20.85 52.37, 20.85 52.10))'), ST_GeomFromText('LINESTRING(21.0122 52.2297, 19.9450 50.0647)')),
  (2, 'Kraków', 800000, ST_GeomFromText('POINT(19.9450 50.0647)'), NULL, NULL),
  (3, 'Gdańsk', 486000, ST_GeomFromText('POINT(18.6466 54.3520)'), NULL, ST_GeomFromText('LINESTRING(18.6466 54.3520, 21.0122 52.2297)')),
  (4, 'Wrocław', 674000, ST_GeomFromText('POINT(17.0385 51.1079)'), NULL, NULL),
  (5, 'Nowhere', 0, NULL, NULL, NULL);
