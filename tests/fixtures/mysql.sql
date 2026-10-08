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
