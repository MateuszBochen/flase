
export interface DumpOptionsInterface {
  database: string;
  /** empty - all tables and views of database */
  tables: string[];
  structure: boolean;
  data: boolean;
  /** DROP TABLE IF EXISTS before CREATE TABLE */
  dropTables: boolean;
  /** CREATE DATABASE IF NOT EXISTS + USE */
  createDatabase: boolean;
  views: boolean;
  triggers: boolean;
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

export interface DumpFinishedInterface {
  tabId?: string;
  tables: number;
  rows: number;
  bytes: number;
  error?: string;
}
