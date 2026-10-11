# Changelog

All notable changes of Flase are documented here. Format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/). A `v*` tag publishes the Docker image of the version.

## [Unreleased]

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

[Unreleased]: https://github.com/MateuszBochen/flase/compare/v0.0.1...HEAD
[0.0.1]: https://github.com/MateuszBochen/flase/releases/tag/v0.0.1
