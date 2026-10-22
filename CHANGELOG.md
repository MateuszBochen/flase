# Changelog

All notable changes of Flase are documented here. Format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/). A `v*` tag publishes the Docker image of the version.

## [0.7.0] - 2026-10-22

### Added
- **SSH tunnel** of connections - database reachable only from a bastion / jump host. Flase server logs in to the SSH
  server and connects to the database through it (host of DSN as seen from SSH server). Login by password, private key
  (file of this computer or pasted, encrypted keys with passphrase) or key file of the server (`FLASE_SSH_KEY_DIR`,
  default `FLASE_CERT_DIR`). Host key of SSH server is confirmed at first connection (Test connection or prompt
  when connecting), changed key stops the connection with a warning. SSH secrets are sent only with login and
  remembered only with "Remember password" (encrypted). TLS of database works inside the tunnel, lost or idle
  SSH connection is opened again by the next query
- Predefined connections (`FLASE_CONNECTIONS`) with `ssh` - tunnel and its secrets only in configuration of server,
  never sent to browser; `hostKey` is required
- Databases (schemas, databases of PostgreSQL server) with the same prefix are grouped in sidebar - e.g. `shop_dev`,
  `shop_prod`, `shop_test` in group `shop_` with count; group needs 3 databases, big groups are split by the next part
  of name (`client_x_` in `client_`). Open groups are remembered, grouping can be turned off per connection in context
  menu of database

### Changed
- Edit of connection (settings of connection in sidebar) uses the same form as new connection, in popup - engine,
  host / port / database or DSN, TLS, user, name, color and safety options; Test connection and Save & connect.
  While connection is open, engine, server, TLS and user cannot be changed (disconnect in the popup unlocks them).
  Saved password is forgotten when user of connection is changed

## [0.6.0] - 2026-10-20

### Added
- Tabs can be moved as in browser - dragged by mouse (other tabs make room) or by Alt + Shift + → / ←. Content of moved
  tab is kept, order is restored after reload

## [0.5.0] - 2026-10-18

### Added
- "No foreign key checks" option of pending changes when rows are deleted - rows referenced by other tables can be
  deleted (MySQL / MariaDB: `FOREIGN_KEY_CHECKS = 0`, set back after the transaction also when it failed;
  PostgreSQL: `session_replication_role = replica` for the transaction, needs superuser and skips also other triggers).
  SQL preview shows these statements too
- The same option in confirmation of "Truncate table…" and "Drop table…" from toolbar of table tab (it was only in
  operations of tables list) - MySQL / MariaDB: `FOREIGN_KEY_CHECKS = 0`, PostgreSQL: `CASCADE`

### Fixed
- MySQL / MariaDB: statements of structure change were executed on different connections of pool - session settings
  (e.g. `FOREIGN_KEY_CHECKS = 0`) did not apply to the following statements

## [0.4.0] - 2026-10-14

### Added
- Editing of binary values (BLOB, BINARY, VARBINARY, bytea) in value editor - as hex, as UTF-8 text, as UUID (16 bytes)
  or by upload of a file (up to 16 MiB); double click on binary cell, "Edit cell…" and binary field of row form
  open it. Value longer than preview of the grid (4 KiB) can be replaced by file or set to NULL

### Fixed
- Copy and export of rows as JSON, CSV, TSV, XML and other text formats wrote binary values which are not text
  (BINARY hashes, BLOB) as "[BLOB 16 B]" - they are written as hex 0x… now, like in the grid; only values longer
  than preview of the grid (4 KiB) stay label
- Download of binary value after it was changed gave the old file (cache of loaded values)
- Edit row form showed "[object Object]" for binary values of read only columns
- Value editor was wider than its popup on big screens (from about 1600 px) and popup had horizontal scrollbar

## [0.3.1] - 2026-10-14

### Fixed
- After session expired on server (e.g. computer slept longer than token lifetime) open tab kept blue icon of
  connection and every query failed with "Not connected" - websockets of closed session are closed now, the tab
  logs in again with saved password or the icon turns grey and opens login

## [0.3.0] - 2026-10-13

### Added
- Download of binary value (BLOB, BINARY, bytea) as file - "Download value" in menu of cell and button in value editor;
  long value is loaded whole from server (grid has only first 4 KiB), file name is table-column-key
- Sidebar marks tables open in tabs (data, structure, import / export of table) - pale bar, table of the current tab
  has full bar and bold name
- DSN with IPv6 address of host (`mysql://[::1]:3306`) and with slash without database (`mysql://db:3306/`)
- `FLASE_CONNECT_TIMEOUT_SECONDS` (default 10) - login to unreachable PostgreSQL server waited for TCP timeout (minutes)

### Changed
- List of tables in sidebar uses the whole height of sidebar instead of fixed 300 px - it grows to the bottom of window,
  shows all tables when they fit; more open lists share the space (short list keeps all its tables, at least 5 rows each)
- Icon of connection blinks red / blue while connection to server is lost and client reconnects; it can be clicked
  to try again at once (before it stayed blue and could not be clicked). Reconnect attempts are at most 10 s apart
- Login errors of network say what is probably wrong (no answer in time, refused connection, not a MySQL server)
- Certificate in DSN without `sslmode` turns TLS on (`verify-ca` with `sslrootcert`, otherwise `require`) -
  before it was ignored and connection was not encrypted
- Errors of API (e.g. invalid JSON of request) are JSON instead of HTML page with stack trace

### Fixed
- White page after start when data stored in browser were corrupted (connections, open tabs) or tab of other version
  was restored - invalid items are left out; error of one tab is shown in the tab (Try again / Close tab), other tabs
  and sidebar keep working
- Table with backtick in name (`` a`b ``) could not be opened
- Fast closing of tabs (Alt+W) left tabs without the shown one - empty page
- Foreign key to binary key (`BINARY(16)`, `bytea`) opened `WHERE id = '[object Object]'` - binary values are written
  as bytes (`X'..'`, `decode(.., 'hex')`) in navigation, quick filters (now also for short binary values) and copy as
  SQL INSERT; name of referenced row is shown next to binary foreign key too, menu of cell has "Open ... row" for it
- Server stopped (all sessions of all users) after malformed websocket message (`null`, number, array), command
  with `null` payload or import of corrupted / truncated gzip file
- Dump of missing database or table downloaded an empty file - download fails with the error now
- DSN with port 0 was accepted

## [0.2.1] - 2026-10-12

### Added
- UUID kept as 16 bytes (`BINARY(16)`, `bytea`) is shown as UUID - recognized by UUID default of column or by
  version and variant bits of all values on the page (MD5 hashes and other bytes stay hex); "Display column as" shows
  recognized column and can switch it to hexadecimal or force UUID, value is copied as UUID, value editor has UUID view
- Filter of tables in sidebar: arrows choose table (typed filter chooses the first one), Enter opens it,
  Shift+Enter in new tab, Ctrl+Enter in new tab in background, Escape clears filter
- Middle click (or Ctrl+click) on Data / Structure of table opens the view in new tab

### Changed
- Browser tab shows name and icon of Flase instead of "React App"
- Popup is closed by Escape and by click outside of it (like Cancel / Close button)
- Filter and icons of database stay on top in sidebar, only list of tables scrolls

### Fixed
- Tabs of database opened in PostgreSQL tree had no color of the connection
- Ctrl+S right after editing of cell (Enter, Escape) or after closing of popup opened "Save page" of browser instead of
  submitting changes - focus is returned to grid and Ctrl+S goes to the last used grid
- Application stopped answering (until restart of server) when many tabs loaded data at once - e.g. application open
  in two windows restoring the same tabs, or several SQL consoles: queries of tabs took all connections of the pool and
  waited for another connection to read structure of their tables; sessions of tabs have own pool now

## [0.2.0] - 2026-10-12

### Added
- PostgreSQL connection without database in DSN (`postgresql://host:5432`) shows databases of server like pgAdmin -
  database -> schemas -> tables; database is opened with login of the connection (password is not asked again),
  more databases can be open at once, open databases and their tabs are restored after reload
- Database of PostgreSQL connection is shown in overview of schema

### Changed
- PostgreSQL connection opens database named as the user (like psql) when DSN has no database, `postgres` only when
  such database does not exist (it was always `postgres`)

### Fixed
- Link to referenced row in grid could not be clicked when long value (UUID) was shown with label of referenced row

## [0.1.0] - 2026-10-11

### Added
- Database overview (phpMyAdmin "Structure" of database): tables and views with rows, sizes, engine, collation and comment,
  filter, selection of more tables; procedures, functions, triggers and events
- Operations on selected tables: export, truncate, drop (views too), with disabled foreign key checks (MySQL) or CASCADE (PostgreSQL)
- Table maintenance: OPTIMIZE, ANALYZE, CHECK, REPAIR (MySQL / MariaDB), VACUUM, VACUUM FULL, VACUUM ANALYZE, ANALYZE,
  REINDEX (PostgreSQL) with messages for every table - from overview and from context menu of table in sidebar
- Create table form: columns (type, null, default, auto increment, primary key, comment, order), indexes, engine,
  collation and comment, SQL preview
- Table options in structure: engine, collation (also conversion of existing columns), comment, next AUTO_INCREMENT
  (identity / serial sequence in PostgreSQL)
- Create, rename and drop of database (schema in PostgreSQL), collation of database with optional conversion of all tables
- Procedures, functions, triggers, events and views: new from template, edit of definition in SQL editor, drop;
  failed change of MySQL routine restores the previous definition; overloaded PostgreSQL functions
- Execute procedure / function with parameters - CALL / SELECT opened and run in SQL console (OUT values in result)
- Create view from query of SQL console
- Context menus: database in sidebar (overview, new table, console, import / export, search, ER diagram, collation,
  rename, drop) and table in sidebar (rename, copy, truncate, drop, maintenance, export)

- Server tab (gauge icon of connection):
  - live monitor - uptime, connections, queries (transactions) per second, statements (rows) per second, traffic,
    buffer pool / cache hit ratio, slow queries, deadlocks, temporary tables / files; charts of last readings,
    refresh interval and pause
  - status variables (SHOW GLOBAL STATUS, pg_stat_*) with change since previous reading and average per second
  - variables with filter, default value, source, description, restart flags; change by SET GLOBAL / SET PERSIST
    (MySQL 8) / ALTER SYSTEM + reload (PostgreSQL), reset to default, SQL preview
  - advisor - buffer pool / cache, connections, temporary tables, slow log, table cache, joins without indexes,
    deadlocks, idle in transaction, checkpoints, autovacuum... with link to the variable
  - character sets, collations and storage engines (MySQL), databases, collations, access methods and extensions (PostgreSQL)
  - replication - role of server, replica channels with IO / SQL thread, lag and errors, connected replicas, binary log
    position and GTID (MySQL / MariaDB); standbys, replication slots, WAL receiver, publications and subscriptions (PostgreSQL);
    binary logs with their events, WAL files; new binary log, purge of old logs, start / stop replica, switch WAL, drop slot
- Visual query builder: tables from list (click or drag), joins from foreign keys or drawn from column to column,
  INNER / LEFT / RIGHT join, grid of columns with alias, aggregate, sort and filter (WHERE / HAVING, GROUP BY added),
  DISTINCT, LIMIT, live SQL, run in console, create view, state restored after reload
- Export of rows (current page or all rows) as Excel (XLSX), OpenDocument (ODS), XML (format of mysqldump --xml),
  HTML, LaTeX and PDF (printable page, "Save as PDF" of browser); copy of selection also as XML, HTML table and LaTeX
- Chart of loaded rows - bar, line, pie, scatter; label column, more value columns, grouping (sum, average, count,
  min, max), sorting, export as PNG / SVG
- Map of spatial values - MySQL / MariaDB geometries, PostgreSQL geometric types, WKT and GeoJSON values; points, lines
  and polygons, OpenStreetMap background for longitude / latitude, labels, values of clicked row, zoom, export as SVG
- Find and replace in column of table - plain text (exact letter case) or regular expression, count and sample of changed
  rows with marked difference, UPDATE previewed, whole table is changed
- Value of referenced row next to foreign key in grid - display column guessed (name, title, email...) or chosen in
  context menu ("Show from ..."), remembered per referenced table
- Transformations of columns in grid ("Display column as") - image from binary value (whole value is loaded when it is
  longer than preview), image from URL, link (URL, e-mail), Unix time as date, size in bytes, yes / no, hexadecimal;
  remembered per column
- Foreign keys: add (also composite, ON DELETE / ON UPDATE) and drop in structure of table and in ER diagram
  (relation mode - click column, then referenced column; right click on relation drops it)

### Fixed
- MySQL 8: sizes, rows and AUTO_INCREMENT of tables were read from statistics cached up to 24 hours

## [0.0.2] - 2026-10-10

### Added
- TLS / SSL of database connections: `sslmode` in DSN (`disable`, `require`, `verify-ca`, `verify-full`, also MySQL names),
  own CA (`sslrootcert`) and client certificate (`sslcert`, `sslkey`) from `FLASE_CERT_DIR`; section in new connection form
- Remember password in browser - encrypted by AES-GCM with a non-extractable key (HTTPS / localhost), connect without form,
  login again with saved password after expired session, "Forget saved password" in connection settings
- State restored after reload of page: open tabs with their order and active tab, query of table (filter, sort, page),
  text of SQL console, loaded list of databases and open database
- License: GNU Affero General Public License v3 or later (`AGPL-3.0-or-later`)
- Support links (Buy Me a Coffee, buycoffee.to) and badges in README

### Fixed
- `verify-full` of MySQL / MariaDB checks host name of certificate (driver `mysql` checked only the chain)
- `verify-ca` of PostgreSQL does not require host name match (it was the same as `verify-full`)

## [0.0.1] - 2026-10-10

First public version - web database manager for MySQL, MariaDB and PostgreSQL, alternative to phpMyAdmin.

### Connections
- MySQL (`mysql://`), MariaDB (`mariadb://`) and PostgreSQL (`postgresql://`, schemas as an extra tree level)
- New connection form: engine, host / port / database or DSN, test connection, save, save & connect
- Connection settings: name, DSN, user, color, read only mode, confirmation of every change; disconnect and delete
- Read only connections - changes refused by server and database session is read only
- Colored connections and their tabs (e.g. red production)
- Predefined connections of administrator (`FLASE_CONNECTIONS`) with address and read only enforced by server,
  own connections can be disabled (`FLASE_ALLOW_CUSTOM_CONNECTIONS=false`)
- Several servers open at once in the sidebar, open state remembered
- Connection icon: blue when connected, green blink when data are coming

### Data grid
- Virtualized rows and columns - fast with many columns and rows
- Inline editing, Edit cell popup (big text area for texts and JSON, editor by type for numbers, dates, enum)
- Multi selection, delete of selected rows, add / clone / edit row in a form, set NULL
- Pending changes with SQL preview, Ctrl + S submit, optional confirmation
- Copy selection and copy whole selected rows as TSV, CSV, JSON, Markdown or SQL INSERT
- Foreign key navigation, quick filters, sorting, paging, query bar with history and completion
- Resizable columns (drag, double click to fit content), widths remembered per table
- Value editor for JSON, long texts and binary values
- UUID keys (CHAR(36), native UUID of MariaDB, uuid of PostgreSQL) and binary keys (BINARY(16), bytea)
- Shift + wheel scrolls columns, wheel scrolls rows

### Structure
- Columns, indexes, foreign keys, triggers and DDL of tables and views
- Changes of columns, indexes and foreign keys with preview of DDL
- Rename, copy, truncate and drop of tables

### SQL console
- Many statements, results in tabs, messages, history and saved queries
- Run statement under cursor or all statements, EXPLAIN, cancel of running query
- Processlist with kill of queries, search across tables of a database

### Import / export
- Streamed SQL dumps (structure and / or data, gzip)
- SQL and CSV import with progress, column mapping, preview and stop on error
- Export shown as text, import of pasted text

### Other
- ER diagram with movable layout and SVG export
- Users and privileges (accounts, roles, GRANTs)
- Dark and light theme, keyboard shortcuts (F1)

### Deployment
- Production Docker image (`docker/production/Dockerfile`): application, API and websocket on one port
- GitHub Actions workflow publishing the image to Docker Hub on a `v*` tag

[0.7.0]: https://github.com/MateuszBochen/flase/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/MateuszBochen/flase/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/MateuszBochen/flase/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/MateuszBochen/flase/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/MateuszBochen/flase/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/MateuszBochen/flase/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/MateuszBochen/flase/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/MateuszBochen/flase/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/MateuszBochen/flase/compare/v0.0.2...v0.1.0
[0.0.2]: https://github.com/MateuszBochen/flase/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/MateuszBochen/flase/releases/tag/v0.0.1
