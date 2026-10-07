-- The `mysql` npm package does not support caching_sha2_password (MySQL 8+ default),
-- so switch the accounts to mysql_native_password. MySQL only - MariaDB uses it by default.
ALTER USER 'root'@'%' IDENTIFIED WITH mysql_native_password BY 'root';
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root';
ALTER USER 'flase'@'%' IDENTIFIED WITH mysql_native_password BY 'flase';
FLUSH PRIVILEGES;
