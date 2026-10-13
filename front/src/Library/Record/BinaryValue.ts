
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
