/** numbers of server status */

export const formatNumber = (value: number, digits: number = 0): string => value.toLocaleString(undefined, {maximumFractionDigits: digits});

export const formatBytes = (bytes: number): string => {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = Math.abs(bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${bytes < 0 ? '-' : ''}${unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};

/** rate of counter - small values keep decimals */
export const formatRate = (value: number): string => formatNumber(value, value < 10 ? 2 : value < 100 ? 1 : 0);

export const formatDuration = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days} d ${hours} h`;
  if (hours) return `${hours} h ${minutes} min`;
  return `${minutes} min ${Math.floor(seconds % 60)} s`;
};

export const formatPercent = (ratio: number): string => `${formatNumber(ratio * 100, ratio > 0.999 && ratio < 1 ? 2 : 1)} %`;
