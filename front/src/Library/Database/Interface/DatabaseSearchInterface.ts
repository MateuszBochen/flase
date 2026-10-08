import DatabaseInterface from './Database';

export type SearchModeType = 'contains' | 'exact';

export interface DatabaseSearchRequestInterface {
  tabId?: string;
  database: DatabaseInterface;
  term: string;
  mode: SearchModeType;
}

/** one table with matches */
export interface DatabaseSearchResultInterface {
  tabId?: string;
  table: string;
  /** rows matching in any column */
  rows: number;
  /** text - column is compared directly, otherwise as CAST(column AS CHAR) */
  columns: {name: string, rows: number, text: boolean}[];
}

export interface DatabaseSearchFinishedInterface {
  tabId?: string;
  tables: number;
  tablesWithMatches: number;
  /** tables which could not be searched */
  warnings: string[];
}
