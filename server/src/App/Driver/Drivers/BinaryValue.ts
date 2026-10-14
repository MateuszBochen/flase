
const BINARY_PREVIEW_BYTES = 4096;
const BINARY_TEXT_BYTES = 64 * 1024;

/** binary values (BLOB, BINARY, bytea) would be sent as huge array of bytes - client gets size, hex preview and text */
export const serializeBinaryValue = (value: any): any => {
  if (!Buffer.isBuffer(value)) {
    return value;
  }
  const previewBytes = value.subarray(0, BINARY_PREVIEW_BYTES);
  const text = value.length <= BINARY_TEXT_BYTES ? value.toString('utf8') : null;
  // replacement character = not valid utf8, control characters = not text
  const isText = text !== null && !text.includes('�') && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
  return {
    binary: true,
    size: value.length,
    hex: previewBytes.toString('hex'),
    truncated: value.length > previewBytes.length,
    text: isText ? text : null,
  };
};

/**
 * binary value as client got it (see serializeBinaryValue) back to bytes - e.g. BINARY(16) key in WHERE of row change
 * preview of long value is not whole value, row cannot be identified by it
 */
export const deserializeBinaryValue = (value: any): any => {
  if (value === null || typeof value !== 'object' || value.binary !== true || typeof value.hex !== 'string') {
    return value;
  }
  if (value.truncated) {
    throw new Error('Row cannot be identified by binary value longer than its preview - add primary key of other type');
  }
  return Buffer.from(value.hex, 'hex');
};

/** largest binary value which can be written from client (value editor, uploaded file) */
export const MAX_BINARY_WRITE_BYTES = 16 * 1024 * 1024;

/**
 * new value of binary column (UPDATE / INSERT) as client sends it - same shape as serializeBinaryValue,
 * preview of long value is only its beginning, it would cut the value
 */
export const deserializeBinaryWriteValue = (value: any): any => {
  if (value === null || typeof value !== 'object' || value.binary !== true) {
    return value;
  }
  if (value.truncated) {
    throw new Error('Binary value longer than its preview cannot be saved - grid has only its beginning');
  }
  if (typeof value.hex !== 'string' || value.hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(value.hex)) {
    throw new Error('Binary value is not valid hexadecimal');
  }
  if (value.hex.length / 2 > MAX_BINARY_WRITE_BYTES) {
    throw new Error(`Binary value is larger than ${MAX_BINARY_WRITE_BYTES / 1024 / 1024} MiB`);
  }
  return Buffer.from(value.hex, 'hex');
};

/** values of row change with binary values as bytes */
export const deserializeBinaryWriteValues = (values: {[column: string]: any}): {[column: string]: any} => {
  return Object.fromEntries(Object.entries(values).map(([column, value]) => [column, deserializeBinaryWriteValue(value)]));
};
