-- MariaDB only (loaded after mysql.sql): native UUID type
DROP TABLE IF EXISTS uuid_native_child;
DROP TABLE IF EXISTS uuid_native_test;
CREATE TABLE uuid_native_test (
  id UUID NOT NULL DEFAULT UUID(),
  name VARCHAR(100) NOT NULL,
  PRIMARY KEY (id)
);
CREATE TABLE uuid_native_child (
  id UUID NOT NULL DEFAULT UUID(),
  parent_id UUID NOT NULL,
  note VARCHAR(100) NULL,
  PRIMARY KEY (id),
  CONSTRAINT fk_uuid_native_parent FOREIGN KEY (parent_id) REFERENCES uuid_native_test (id)
);
INSERT INTO uuid_native_test (id, name) VALUES
  ('3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01', 'first'),
  ('7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c02', 'second');
INSERT INTO uuid_native_child (id, parent_id, note) VALUES
  ('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c21', '3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01', 'child of first');
