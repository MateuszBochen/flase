import React, {useMemo, useRef, useState} from 'react';
import Popup from '../../../UI/Popup/Popup';
import Button from '../../../UI/Button/Button';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {SingleRowType} from '../Interface/RecordsViewPropsInterface';
import {isBinaryValue} from '../../../Library/Record/BinaryValue';
import '../Map/style.css';
import './style.css';

interface ChartPopupPropsInterface {
  columns: ColumnInterface[];
  rows: SingleRowType[];
  name: string;
  onClose: () => void;
}

type ChartKindType = 'bar' | 'line' | 'pie' | 'scatter';
type AggregateType = 'none' | 'sum' | 'avg' | 'count' | 'min' | 'max';
type SortType = 'none' | 'label' | 'value';
type PointType = {label: string, x: number | null, values: number[]};

const WIDTH = 860;
const HEIGHT = 380;
const MARGIN = {top: 16, right: 16, bottom: 80, left: 64};
const COLORS = ['#3574f0', '#5fa84f', '#e5a50a', '#d9534f', '#9b6bdf', '#21a3b5', '#e0742d', '#7f8c8d'];
const MAX_POINTS = 300;
const PIE_SLICES = 12;
const NUMERIC_TYPE = /^(tinyint|smallint|mediumint|int|integer|bigint|serial|decimal|numeric|float|double|real|money|year)\b/i;

const numberOf = (value: any): number | null => {
  if (value === null || value === undefined || value === '' || isBinaryValue(value) || typeof value === 'object') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const labelOf = (value: any): string => value === null || value === undefined ? 'NULL' : typeof value === 'object' ? JSON.stringify(value) : String(value);

/** columns with numbers - by type or by values */
export const numericColumns = (columns: ColumnInterface[], rows: SingleRowType[]): ColumnInterface[] => columns.filter((column) => {
  const values = rows.map((row) => row[column.key]).filter((value) => value !== null && value !== undefined && value !== '');
  if (!values.length) return NUMERIC_TYPE.test(column.type || '');
  return values.filter((value) => numberOf(value) !== null).length / values.length >= 0.9;
});

/** 1, 2, 5 x 10^n above value - readable top of axis */
const niceMax = (value: number): number => {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((item) => item * power >= value) || 10;
  return step * power;
};

const formatValue = (value: number): string => {
  const size = Math.abs(value);
  const short = (divider: number, unit: string) => `${(value / divider).toLocaleString(undefined, {maximumFractionDigits: 2})}${unit}`;
  if (size >= 1e9) return short(1e9, 'G');
  if (size >= 1e6) return short(1e6, 'M');
  if (size >= 1e4) return short(1e3, 'k');
  return value.toLocaleString(undefined, {maximumFractionDigits: 2});
};

/** ChartPopup - bar, line, pie or scatter chart of loaded rows, optional grouping with aggregate */
export default (props: ChartPopupPropsInterface) => {
  const numeric = useMemo(() => numericColumns(props.columns, props.rows), [props.columns, props.rows]);
  const labels = props.columns.filter((column) => !numeric.includes(column));
  const [kind, setKind] = useState<ChartKindType>('bar');
  const [xKey, setXKey] = useState<string>((labels[0] || props.columns[0])?.key || '');
  const [yKeys, setYKeys] = useState<string[]>(() => {
    const values = numeric.filter((column) => column.key !== xKey && !column.primaryKey);
    return (values.length ? values : numeric.filter((column) => column.key !== xKey)).slice(0, 1).map((column) => column.key);
  });
  const xColumn = props.columns.find((column) => column.key === xKey);
  const repeated = useMemo(() => new Set(props.rows.map((row) => labelOf(row[xKey]))).size < props.rows.length, [props.rows, xKey]);
  const [aggregate, setAggregate] = useState<AggregateType>(repeated ? 'sum' : 'none');
  const [sort, setSort] = useState<SortType>('none');
  const svgRef = useRef<SVGSVGElement | null>(null);

  const series = aggregate === 'count' ? ['count'] : yKeys;
  const seriesName = (key: string) => key === 'count' ? 'count' : props.columns.find((column) => column.key === key)?.name || key;

  const points = useMemo((): PointType[] => {
    let result: PointType[];
    if (aggregate === 'none') {
      result = props.rows.map((row) => ({label: labelOf(row[xKey]), x: numberOf(row[xKey]), values: yKeys.map((key) => numberOf(row[key]) ?? NaN)}));
    } else {
      const groups = new Map<string, SingleRowType[]>();
      props.rows.forEach((row) => {
        const label = labelOf(row[xKey]);
        if (!groups.has(label)) groups.set(label, []);
        groups.get(label)!.push(row);
      });
      result = Array.from(groups.entries()).map(([label, groupRows]) => ({
        label,
        x: numberOf(groupRows[0][xKey]),
        values: aggregate === 'count' ? [groupRows.length] : yKeys.map((key) => {
          const values = groupRows.map((row) => numberOf(row[key])).filter((value): value is number => value !== null);
          if (!values.length) return NaN;
          switch (aggregate) {
            case 'sum': return values.reduce((total, value) => total + value, 0);
            case 'avg': return values.reduce((total, value) => total + value, 0) / values.length;
            case 'min': return Math.min(...values);
            default: return Math.max(...values);
          }
        }),
      }));
    }
    if (sort === 'label') {
      result = [...result].sort((a, b) => a.x !== null && b.x !== null ? a.x - b.x : a.label.localeCompare(b.label));
    } else if (sort === 'value') {
      result = [...result].sort((a, b) => (b.values[0] || 0) - (a.values[0] || 0));
    }
    return result.slice(0, MAX_POINTS);
  }, [props.rows, xKey, yKeys, aggregate, sort]);

  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const values = points.flatMap((point) => point.values).filter((value) => Number.isFinite(value));
  const top = niceMax(Math.max(0, ...values));
  const bottom = Math.min(0, ...values) < 0 ? -niceMax(-Math.min(0, ...values)) : 0;
  const y = (value: number) => MARGIN.top + plotHeight - ((value - bottom) / (top - bottom)) * plotHeight;
  const band = points.length ? plotWidth / points.length : plotWidth;
  const xNumbers = points.map((point) => point.x).filter((value): value is number => value !== null);
  const xMin = Math.min(...xNumbers);
  const xMax = Math.max(...xNumbers);
  const scatterX = (value: number) => MARGIN.left + (xMax === xMin ? plotWidth / 2 : ((value - xMin) / (xMax - xMin)) * plotWidth);
  const labelEvery = Math.max(1, Math.ceil(points.length / Math.max(1, Math.floor(plotWidth / 28))));

  const axes = () => (
    <g className="chart-axes">
      {Array.from({length: 6}, (item, index) => {
        const value = bottom + ((top - bottom) * index) / 5;
        return (
          <g key={index}>
            <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(value)} y2={y(value)} className="chart-grid" />
            <text x={MARGIN.left - 6} y={y(value) + 4} textAnchor="end">{formatValue(value)}</text>
          </g>
        );
      })}
      {kind !== 'scatter' && points.map((point, index) => index % labelEvery === 0 && (
        <text key={index} transform={`translate(${MARGIN.left + band * index + band / 2} ${HEIGHT - MARGIN.bottom + 12}) rotate(-40)`} textAnchor="end">
          {point.label.length > 18 ? `${point.label.slice(0, 17)}…` : point.label}
        </text>
      ))}
      {kind === 'scatter' && xNumbers.length > 0 && Array.from({length: 6}, (item, index) => {
        const value = xMin + ((xMax - xMin) * index) / 5;
        return <text key={index} x={scatterX(value)} y={HEIGHT - MARGIN.bottom + 16} textAnchor="middle">{formatValue(value)}</text>;
      })}
      <line x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={y(0)} y2={y(0)} className="chart-axis" />
    </g>
  );

  const chart = () => {
    if (!points.length || !series.length) {
      return <text x={WIDTH / 2} y={HEIGHT / 2} textAnchor="middle" className="chart-empty">Choose column with values</text>;
    }
    switch (kind) {
      case 'bar': {
        const width = Math.max(1, (band * 0.8) / series.length);
        return (
          <>
            {axes()}
            {points.map((point, index) => point.values.map((value, serie) => Number.isFinite(value) && (
              <rect
                key={`${index}-${serie}`}
                className="chart-bar"
                x={MARGIN.left + band * index + band * 0.1 + width * serie}
                y={Math.min(y(value), y(0))}
                width={width}
                height={Math.abs(y(value) - y(0))}
                fill={COLORS[serie % COLORS.length]}
              >
                <title>{`${point.label} · ${seriesName(series[serie])}: ${formatValue(value)}`}</title>
              </rect>
            )))}
          </>
        );
      }
      case 'line':
        return (
          <>
            {axes()}
            {series.map((key, serie) => (
              <g key={key}>
                <path
                  className="chart-line"
                  stroke={COLORS[serie % COLORS.length]}
                  d={points.map((point, index) => Number.isFinite(point.values[serie]) ? `${index && Number.isFinite(points[index - 1].values[serie]) ? 'L' : 'M'}${MARGIN.left + band * index + band / 2},${y(point.values[serie])}` : '').join(' ')}
                />
                {points.length <= 120 && points.map((point, index) => Number.isFinite(point.values[serie]) && (
                  <circle key={index} className="chart-point" cx={MARGIN.left + band * index + band / 2} cy={y(point.values[serie])} r={3} fill={COLORS[serie % COLORS.length]}>
                    <title>{`${point.label} · ${seriesName(key)}: ${formatValue(point.values[serie])}`}</title>
                  </circle>
                ))}
              </g>
            ))}
          </>
        );
      case 'scatter':
        return (
          <>
            {axes()}
            {series.map((key, serie) => points.map((point, index) => point.x !== null && Number.isFinite(point.values[serie]) && (
              <circle key={`${serie}-${index}`} className="chart-point" cx={scatterX(point.x)} cy={y(point.values[serie])} r={4} fill={COLORS[serie % COLORS.length]} fillOpacity={0.75}>
                <title>{`${point.label} · ${seriesName(key)}: ${formatValue(point.values[serie])}`}</title>
              </circle>
            )))}
          </>
        );
      case 'pie': {
        // first series, biggest slices, the rest together
        const slices = points.filter((point) => Number.isFinite(point.values[0]) && point.values[0] > 0).sort((a, b) => b.values[0] - a.values[0]);
        const shown = slices.slice(0, PIE_SLICES).map((point) => ({label: point.label, value: point.values[0]}));
        const rest = slices.slice(PIE_SLICES).reduce((total, point) => total + point.values[0], 0);
        if (rest > 0) shown.push({label: 'other', value: rest});
        const total = shown.reduce((sum, slice) => sum + slice.value, 0);
        const radius = Math.min(HEIGHT - 40, WIDTH / 2) / 2;
        const centerX = WIDTH / 3;
        const centerY = HEIGHT / 2;
        let angle = -Math.PI / 2;
        return (
          <>
            {shown.map((slice, index) => {
              const part = slice.value / total;
              const start = angle;
              angle += part * 2 * Math.PI;
              const large = part > 0.5 ? 1 : 0;
              const path = part >= 0.9999
                ? `M ${centerX - radius} ${centerY} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`
                : `M ${centerX} ${centerY} L ${centerX + radius * Math.cos(start)} ${centerY + radius * Math.sin(start)} A ${radius} ${radius} 0 ${large} 1 ${centerX + radius * Math.cos(angle)} ${centerY + radius * Math.sin(angle)} Z`;
              return (
                <path key={index} d={path} fill={COLORS[index % COLORS.length]} className="chart-slice">
                  <title>{`${slice.label}: ${formatValue(slice.value)} (${(part * 100).toFixed(1)} %)`}</title>
                </path>
              );
            })}
            {shown.map((slice, index) => (
              <g key={`legend-${index}`} transform={`translate(${WIDTH * 0.62} ${30 + index * 22})`}>
                <rect width={12} height={12} fill={COLORS[index % COLORS.length]} />
                <text x={18} y={11} className="chart-legend-text">{`${slice.label.length > 30 ? `${slice.label.slice(0, 29)}…` : slice.label} - ${(slice.value / total * 100).toFixed(1)} %`}</text>
              </g>
            ))}
          </>
        );
      }
    }
  };

  const svgText = (): string => {
    const clone = svgRef.current!.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = 'text{font:11px sans-serif;fill:#444}.chart-grid{stroke:#e3e3e3}.chart-axis{stroke:#999}.chart-line{fill:none;stroke-width:2}';
    clone.insertBefore(style, clone.firstChild);
    return new XMLSerializer().serializeToString(clone);
  };
  const download = (blob: Blob, extension: string) => {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${props.name}-chart.${extension}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  const exportPng = () => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = WIDTH * 2;
      canvas.height = HEIGHT * 2;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => blob && download(blob, 'png'));
    };
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText())}`;
  };

  const toggleY = (key: string) => setYKeys((previous) => previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key]);

  return (
    <Popup
      isOpen={true}
      label={`Chart of ${props.name}`}
      onClickOk={props.onClose}
      buttons={[
        <Button key="png" size="small" label="Export PNG" onClick={exportPng} disabled={!points.length} />,
        <Button key="svg" size="small" label="Export SVG" onClick={() => download(new Blob([svgText()], {type: 'image/svg+xml'}), 'svg')} disabled={!points.length} />,
        <Button key="close" size="small" label="Close" onClick={props.onClose} />,
      ]}
    >
      <div className="cmp-result-chart">
        <div className="chart-toolbar">
          <span className="chart-kinds" role="tablist">
            {(['bar', 'line', 'pie', 'scatter'] as ChartKindType[]).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={kind === item} className={kind === item ? 'active' : ''} onClick={() => setKind(item)}>{item}</button>
            ))}
          </span>
          <label>{kind === 'scatter' ? 'X' : 'Labels'}
            <select value={xKey} onChange={(event) => setXKey(event.target.value)} aria-label="Label column">
              {props.columns.map((column) => <option key={column.key} value={column.key}>{column.name}</option>)}
            </select>
          </label>
          <label>Group
            <select value={aggregate} onChange={(event) => setAggregate(event.target.value as AggregateType)} aria-label="Aggregate">
              <option value="none">no grouping</option>
              <option value="sum">sum</option>
              <option value="avg">average</option>
              <option value="count">count of rows</option>
              <option value="min">min</option>
              <option value="max">max</option>
            </select>
          </label>
          <label>Sort
            <select value={sort} onChange={(event) => setSort(event.target.value as SortType)} aria-label="Sort">
              <option value="none">as loaded</option>
              <option value="label">by label</option>
              <option value="value">by value</option>
            </select>
          </label>
          {aggregate !== 'count' && (
            <span className="chart-series">
              Values:
              {numeric.filter((column) => column.key !== xKey).map((column) => (
                <label key={column.key} className="checkbox">
                  <input type="checkbox" checked={yKeys.includes(column.key)} onChange={() => toggleY(column.key)} aria-label={`Values ${column.name}`} />
                  {column.name}
                </label>
              ))}
              {!numeric.some((column) => column.key !== xKey) && <span className="chart-muted">no numeric column - use count of rows</span>}
            </span>
          )}
        </div>
        <svg ref={svgRef} className="chart-canvas" width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Chart">
          {chart()}
        </svg>
        <div className="chart-footer">
          {kind !== 'pie' && series.map((key, index) => <span key={key}><i style={{backgroundColor: COLORS[index % COLORS.length]}} />{seriesName(key)}</span>)}
          <span className="chart-muted">
            {points.length} {aggregate === 'none' ? 'rows' : 'groups'} of {props.rows.length} loaded rows{points.length === MAX_POINTS ? ` (first ${MAX_POINTS})` : ''}
            {kind === 'scatter' && xColumn && !xNumbers.length ? ' - X column has no numbers' : ''}
          </span>
        </div>
      </div>
    </Popup>
  );
}
