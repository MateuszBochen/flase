import TableInterface from '../Table/Interface/TableInterface';
type RowValuesType = {[columnName: string]: any};

/** find and replace of text in one column of table */
export interface FindReplaceRequestInterface {
  tabId?: string;
  table: TableInterface;
  column: string;
  find: string;
  replace: string;
  /** REGEXP_REPLACE / regexp_replace instead of REPLACE */
  regex: boolean;
  /** only count and sample of changed rows */
  dryRun: boolean;
}

export interface FindReplaceResultInterface {
  tabId?: string;
  dryRun: boolean;
  /** UPDATE which is (or would be) executed */
  statement: string;
  /** rows which change */
  count: number;
  /** changed rows after execution */
  affected?: number;
  /** primary key columns shown with sample rows */
  keyColumns: string[];
  /** first changed rows - value before and after */
  rows: {key: (string | null)[], before: string | null, after: string | null}[];
}

/** whole binary value of one cell - grid has only preview */
export interface BinaryValueRequestInterface {
  tabId?: string;
  table: TableInterface;
  column: string;
  /** values identifying the row (primary key) */
  where: RowValuesType;
}

export interface BinaryValueResultInterface {
  tabId?: string;
  column: string;
  size: number;
  base64: string;
  /** image/png... detected from first bytes, null when unknown */
  mimeType: string | null;
}

