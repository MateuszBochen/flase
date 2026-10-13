import {BinaryValueInterface} from './BinaryValue';

/** file name extension of types recognized by server (first bytes) */
const EXTENSIONS: {[mimeType: string]: string} = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
};

/** characters not allowed in file names of common systems */
const safeName = (name: string): string => name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 150) || 'value';

const save = (url: string, fileName: string) => {
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
};

/**
 * Binary value (BLOB, BINARY, bytea) saved as file.
 * Whole value is loaded from server (load - null when row cannot be identified, e.g. table without primary key),
 * value which is not longer than its preview is saved without server.
 */
export const downloadBinary = async (
  value: BinaryValueInterface,
  load: () => Promise<{url: string, mimeType: string | null}> | null,
  baseName: string,
): Promise<void> => {
  const loading = load();
  if (loading) {
    const {url, mimeType} = await loading;
    // the url is cached for previews of grid - it is not revoked
    save(url, `${safeName(baseName)}.${EXTENSIONS[mimeType || ''] || 'bin'}`);
    return;
  }
  if (value.truncated) {
    throw new Error('Whole value can be downloaded only from table with primary key - grid has only its beginning');
  }
  const bytes = new Uint8Array((value.hex.match(/../g) || []).map((byte) => parseInt(byte, 16)));
  const url = URL.createObjectURL(new Blob([bytes], {type: 'application/octet-stream'}));
  save(url, `${safeName(baseName)}.bin`);
  setTimeout(() => URL.revokeObjectURL(url), 60 * 1000);
};
