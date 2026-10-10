# Changelog

All notable changes of Flase are documented here. Format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/). A `v*` tag publishes the Docker image of the version.

## [Unreleased]

### Added
- License: GNU Affero General Public License v3 or later (`AGPL-3.0-or-later`)
- Support links (Buy Me a Coffee, buycoffee.to) and badges in README

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
