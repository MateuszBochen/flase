import {SelectionType} from '../Interface/GridEditInterface';
import {SingleRowType} from '../Interface/RecordsViewPropsInterface';

export type SelectionStatsType = {
  /** selected cells (overlapping ranges counted once) */
  cells: number;
  /** cells with number value */
  numbers: number;
  sum: number;
  min: number;
  max: number;
  /** most digits after decimal point of the values - sum and average are shown with them */
  scale: number;
};

/** DECIMAL and BIGINT come from server as strings */
const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

const numberOf = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && NUMBER.test(value.trim())) return Number(value);
  return null;
};

const scaleOf = (value: unknown): number => {
  const match = /\.(\d+)$/.exec(String(value).trim());
  return match ? match[1].length : 0;
};

/** count, sum, min and max of selected cells - like status bar of spreadsheet */
export const selectionStats = (
  selection: SelectionType,
  rowsCount: number,
  columnKeys: string[],
  rowAt: (rowIndex: number) => SingleRowType,
): SelectionStatsType => {
  const stats: SelectionStatsType = {cells: 0, numbers: 0, sum: 0, min: Infinity, max: -Infinity, scale: 0};
  const seen = new Set<number>();
  selection.forEach(({anchor, focus}) => {
    const lastRow = Math.min(Math.max(anchor.rowIndex, focus.rowIndex), rowsCount - 1);
    const lastColumn = Math.min(Math.max(anchor.columnIndex, focus.columnIndex), columnKeys.length - 1);
    for (let row = Math.min(anchor.rowIndex, focus.rowIndex); row <= lastRow; row++) {
      const values = rowAt(row);
      for (let column = Math.min(anchor.columnIndex, focus.columnIndex); column <= lastColumn; column++) {
        const id = row * columnKeys.length + column;
        if (seen.has(id)) continue;
        seen.add(id);
        stats.cells++;
        const value = values[columnKeys[column]];
        const number = numberOf(value);
        if (number === null) continue;
        stats.numbers++;
        stats.sum += number;
        stats.min = Math.min(stats.min, number);
        stats.max = Math.max(stats.max, number);
        stats.scale = Math.max(stats.scale, scaleOf(value));
      }
    }
  });
  return stats;
};

export const formatStatNumber = (value: number, scale: number): string => value.toLocaleString('en-US', {
  maximumFractionDigits: Math.min(Math.max(scale, 0), 20),
  useGrouping: false,
});

/** "Count: 3 · Sum: 6 · Avg: 2 · Min: 1 · Max: 3" */
export const describeSelectionStats = (stats: SelectionStatsType): string => {
  const parts = [`Count: ${stats.cells}`];
  if (stats.numbers) {
    parts.push(
      `Sum: ${formatStatNumber(stats.sum, stats.scale)}`,
      `Avg: ${formatStatNumber(stats.sum / stats.numbers, Math.max(stats.scale, 4))}`,
      `Min: ${formatStatNumber(stats.min, stats.scale)}`,
      `Max: ${formatStatNumber(stats.max, stats.scale)}`,
    );
  }
  return parts.join(' · ');
};
