
/** what is dumped of a table: CREATE TABLE and INSERTs, only CREATE TABLE or only INSERTs */
export type DumpTableModeType = 'both' | 'structure' | 'data';

/**
 * statements of data: insert - plain INSERT, ignore - rows with existing key are skipped (INSERT IGNORE / ON CONFLICT DO NOTHING),
 * upsert - existing rows are updated (ON DUPLICATE KEY UPDATE / ON CONFLICT DO UPDATE), update - UPDATE ... WHERE primary key
 */
export type DumpInsertModeType = 'insert' | 'ignore' | 'upsert' | 'update';

export interface DumpOptionsInterface {
  database: string;
  /** empty - all tables and views of database */
  tables: string[];
  /** structure / data of tables without own mode in tableModes */
  structure: boolean;
  data: boolean;
  /** mode of single tables - views are dumped when their mode has structure */
  tableModes?: {[table: string]: DumpTableModeType};
  /** DROP TABLE IF EXISTS before CREATE TABLE */
  dropTables: boolean;
  /** CREATE DATABASE IF NOT EXISTS + USE */
  createDatabase: boolean;
  views: boolean;
  triggers: boolean;
  /** default insert */
  insertMode?: DumpInsertModeType;
  /** one row in INSERT statement (easy to diff / cut) instead of INSERTs of about 1 MB */
  rowPerInsert?: boolean;
  /** TRUNCATE before data of tables dumped without structure */
  truncateData?: boolean;
}

export interface CsvImportOptionsInterface {
  database: string;
  table: string;
  delimiter: string;
  /** first row contains column names - it is not imported */
  header: boolean;
  /** target table column for every CSV column, null - column is skipped */
  columns: (string | null)[];
  /**
   * which values mean NULL: empty - not quoted empty field, \N - like mysqldump / LOAD DATA,
   * NULL - text NULL without quotes, none - there are no NULL values
   */
  nullValue: 'empty' | '\\N' | 'NULL' | 'none';
  /** remove rows of table before import (TRUNCATE) */
  truncate: boolean;
}

export type TransferRequestType =
  | {kind: 'dump', options: DumpOptionsInterface, gzip: boolean}
  | {kind: 'import-sql', database: string | null, gzip: boolean, stopOnError: boolean, fileName: string}
  | {kind: 'import-csv', options: CsvImportOptionsInterface, gzip: boolean, fileName: string};

export interface ImportProgressInterface {
  tabId?: string;
  bytes: number;
  /** statements executed (SQL) or rows inserted (CSV) */
  statements: number;
  rows: number;
  errors: {statement: string, error: string}[];
}

export interface ImportFinishedInterface extends ImportProgressInterface {
  cancelled: boolean;
  /** import stopped by error, CSV import is rolled back */
  failed: boolean;
  durationMs: number;
}

export interface DumpProgressInterface {
  tabId?: string;
  /** table which is dumped now */
  table: string | null;
  tablesDone: number;
  tablesTotal: number;
  rows: number;
  /** rows of dumped tables estimated by statistics of server (InnoDB / reltuples may be off) */
  estimatedRows: number;
  bytes: number;
}

export interface DumpFinishedInterface {
  tabId?: string;
  tables: number;
  rows: number;
  bytes: number;
  error?: string;
  /** stopped by Cancel of user or cancelled download */
  cancelled?: boolean;
  /** tables without primary key - their data are plain INSERT instead of upsert / UPDATE */
  withoutPrimaryKey?: string[];
}
