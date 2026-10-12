import ColumnInterface from '../Table/Interface/ColumnInterface';
import {BinaryValueInterface, isBinaryValue} from './BinaryValue';

/**
 * UUID kept as 16 bytes (BINARY(16), bytea) - database does not know it is UUID, it is recognized by its layout:
 * version in high nibble of 7th byte (1-8) and variant 10xx in 9th byte. UUID_TO_BIN(uuid, 1) of MySQL moves
 * time_hi_and_version to the beginning - version 1 is then in the first nibble.
 * Random 16 bytes (MD5, token) have the layout by chance once in ~100 values.
 */

/** values of result checked for layout - all of them must have it */
const MAX_CHECKED_VALUES = 500;
/** fewer values must be confirmed by name of column */
const MIN_VALUES_WITHOUT_NAME = 3;

const UUID_NAME = /(^|_)(id|uuid|guid)$|uuid|guid/i;
const UUID_DEFAULT = /uuid/i;
const BINARY_16_TYPE = /^(var)?binary\(16\)$|^bytea$|blob/i;

const isUuidHex = (hex: string): boolean => /^[0-9a-f]{32}$/i.test(hex)
  && /[89ab]/i.test(hex[16])
  && (/[1-8]/.test(hex[12]) || hex[0] === '1');

/** binary value of exactly 16 bytes */
export const isBinary16 = (value: any): value is BinaryValueInterface => isBinaryValue(value) && value.size === 16 && !value.truncated;

/** 3f2c1a9e-6b7d-4e8f-9a0b-1c2d3e4f5a01 */
export const uuidOfHex = (hex: string): string => {
  const text = hex.toLowerCase();
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20, 32)}`;
};

/** column with 16 bytes values looks like UUID - by its default value, or by layout of all its values */
export const isUuidColumn = (column: ColumnInterface, values: any[]): boolean => {
  if (column.type && !BINARY_16_TYPE.test(column.type)) return false;
  const present = values.filter((value) => value !== null && value !== undefined).slice(0, MAX_CHECKED_VALUES);
  if (!present.length || !present.every(isBinary16)) return false;
  if (typeof column.defaultValue === 'string' && UUID_DEFAULT.test(column.defaultValue)) return true;
  if (present.length < MIN_VALUES_WITHOUT_NAME && !UUID_NAME.test(column.orgName || column.name)) return false;
  return present.every((value) => isUuidHex((value as BinaryValueInterface).hex));
};
