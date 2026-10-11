/** numbers in texts of advisor */

export const percentText = (ratio: number): string => `${(Math.round(ratio * 1000) / 10).toLocaleString('en')} %`;

export const formatBytesText = (bytes: number): string => {
  if (!Number.isFinite(bytes)) return '?';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : Math.round(value * 10) / 10} ${units[unit]}`;
};
