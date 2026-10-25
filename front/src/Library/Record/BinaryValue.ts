
/** binary value (BLOB, BINARY) as sent by server - preview only, not the whole value */
export interface BinaryValueInterface {
  binary: true;
  size: number;
  /** hex of first bytes */
  hex: string;
  truncated: boolean;
  /** value as text when it is valid UTF-8 */
  text: string | null;
}

export const isBinaryValue = (value: any): value is BinaryValueInterface => {
  return value !== null && typeof value === 'object' && value.binary === true;
};

/** long text (TEXT, LONGTEXT) as sent by server - only its beginning, whole value is loaded when needed */
export interface LongTextInterface {
  longText: true;
  /** characters of whole value */
  length: number;
  /** beginning of value */
  text: string;
  truncated: true;
}

export const isLongText = (value: any): value is LongTextInterface => {
  return value !== null && typeof value === 'object' && value.longText === true;
};

/** texts longer than this are sent as preview (the same limit as server) */
export const TEXT_PREVIEW_CHARS = 64 * 1024;

/** text too long for narrow inline editor - preview from server or whole value loaded / saved before */
export const isLongTextValue = (value: any): boolean => isLongText(value) || (typeof value === 'string' && value.length > TEXT_PREVIEW_CHARS);

/** long text which could not be loaded whole (copy, export) */
export const longTextLabel = (value: LongTextInterface): string => `[TEXT ${value.length.toLocaleString('en-US')} characters]`;

/** grid has only beginning of long text - SQL with it would compare other text */
export const longTextForSql = (value: LongTextInterface): never => {
  throw new Error(`Text of ${value.length.toLocaleString('en-US')} characters is longer than its preview - it cannot be used in SQL`);
};

/** grid has only preview of long values - SQL with such value would compare other bytes */
export const binaryHexForSql = (value: BinaryValueInterface): string => {
  if (value.truncated) {
    throw new Error(`Binary value of ${formatBytes(value.size)} is longer than its preview - it cannot be used in SQL`);
  }
  return value.hex.toLowerCase();
};

/** short binary values (keys, UUID) can be used in filters - not files */
export const MAX_FILTER_BINARY_BYTES = 64;
export const isFilterableBinary = (value: BinaryValueInterface): boolean => !value.truncated && value.size <= MAX_FILTER_BINARY_BYTES;

/** key of value in maps (labels of referenced rows) - binary values by their bytes */
export const valueKey = (value: any): string => isBinaryValue(value) ? `0x${value.hex.toLowerCase()}` : String(value);

export const formatBytes = (bytes: number): string => {
  const units = ['B', 'KiB', 'MiB', 'GiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
};

/**
 * value in text formats (copy, export): UTF-8 text as it is, other bytes as 0x hex like in SQL,
 * only value longer than its preview stays label - grid does not have its bytes
 */
export const binaryAsText = (value: BinaryValueInterface): string => {
  if (value.text !== null) return value.text;
  return value.truncated ? `[BLOB ${formatBytes(value.size)}]` : `0x${value.hex.toUpperCase()}`;
};

/** short form for grid cell */
export const binaryLabel = (value: BinaryValueInterface): string => {
  if (!value.truncated && value.size <= 16) {
    return `0x${value.hex.toUpperCase()}`;
  }
  return `[BLOB ${formatBytes(value.size)}]`;
};

/** classic hex dump: offset, 16 bytes, ascii */
export const hexDump = (hex: string): string => {
  const lines: string[] = [];
  for (let offset = 0; offset < hex.length / 2; offset += 16) {
    const bytes = hex.slice(offset * 2, (offset + 16) * 2).match(/../g) || [];
    const ascii = bytes.map((byte) => {
      const code = parseInt(byte, 16);
      return code >= 32 && code < 127 ? String.fromCharCode(code) : '.';
    }).join('');
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${bytes.join(' ').padEnd(47, ' ')}  ${ascii}`);
  }
  return lines.join('\n');
};

/** column of bytes (BLOB, BINARY, VARBINARY, bytea) - edited by value editor, not as text in grid */
export const isBinaryColumn = (column: {type?: string | null}): boolean => /^((tiny|medium|long)?blob|(var)?binary|bytea)\b/i.test(column.type || '');

/** largest value which can be written - server refuses bigger ones */
export const MAX_BINARY_WRITE_BYTES = 16 * 1024 * 1024;

/** same bytes - preview of long value is never same as whole value */
export const isSameBinary = (a: BinaryValueInterface, b: BinaryValueInterface): boolean =>
  a.size === b.size && a.truncated === b.truncated && a.hex.toLowerCase() === b.hex.toLowerCase();

/** UTF-8 text like server tells it (not valid UTF-8 or control characters = not text) */
const textOfBytes = (bytes: Uint8Array): string | null => {
  try {
    const text = new TextDecoder('utf-8', {fatal: true}).decode(bytes);
    // eslint-disable-next-line no-control-regex
    return /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text) ? null : text;
  } catch (e) {
    return null;
  }
};

/** new value of binary column in the same form as values from server - whole value, no preview */
export const binaryOfBytes = (bytes: Uint8Array): BinaryValueInterface => {
  let hex = '';
  for (let index = 0; index < bytes.length; index++) {
    hex += bytes[index].toString(16).padStart(2, '0');
  }
  return {binary: true, size: bytes.length, hex, truncated: false, text: textOfBytes(bytes)};
};

export const binaryOfText = (text: string): BinaryValueInterface => binaryOfBytes(new TextEncoder().encode(text));

/** hex typed by user - spaces and new lines are ignored, 0x or \x prefix is allowed; null when it is not hex */
export const parseHexInput = (input: string): string | null => {
  const hex = input.replace(/\s+/g, '').replace(/^(0x|\\x)/i, '');
  return /^([0-9a-f]{2})*$/i.test(hex) ? hex.toLowerCase() : null;
};

/** hex for editing - 16 bytes in line */
export const hexForEditing = (hex: string): string => (hex.toUpperCase().match(/.{1,32}/g) || [])
  .map((line) => (line.match(/../g) || []).join(' '))
  .join('\n');
