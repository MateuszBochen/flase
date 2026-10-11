import TableInterface from './TableInterface';
import {RowValuesType} from './RowChangeInterface';

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

/** files of images recognized by first bytes */
export const mimeTypeOf = (data: Buffer): string | null => {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 6 && /^GIF8[79]a$/.test(data.subarray(0, 6).toString('latin1'))) return 'image/gif';
  if (data.length >= 12 && data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (data.length >= 2 && data[0] === 0x42 && data[1] === 0x4d) return 'image/bmp';
  if (/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i.test(data.subarray(0, 512).toString('utf8'))) return 'image/svg+xml';
  if (data.length >= 4 && data.subarray(0, 4).toString('latin1') === '%PDF') return 'application/pdf';
  return null;
};

/** cells bigger than this are not sent to browser */
export const MAX_BINARY_VALUE_BYTES = 20 * 1024 * 1024;
