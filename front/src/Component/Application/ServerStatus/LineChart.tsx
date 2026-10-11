import React, {useState} from 'react';

export interface ChartSeriesInterface {
  label: string;
  color: string;
  /** null - value not known in this sample (first sample of counter) */
  values: (number | null)[];
}

interface LineChartPropsInterface {
  title: string;
  series: ChartSeriesInterface[];
  /** time of samples (ms) */
  times: number[];
  format: (value: number) => string;
  /** fixed top of scale, e.g. 100 for percent */
  max?: number;
}

const WIDTH = 360;
const HEIGHT = 110;

/** LineChart - small live chart of last samples, value under pointer is shown */
export default (props: LineChartPropsInterface) => {
  const [hover, setHover] = useState<number | null>(null);
  const count = props.times.length;
  const all = props.series.flatMap((serie) => serie.values.filter((value): value is number => value !== null && Number.isFinite(value)));
  const max = props.max ?? Math.max(1, ...all) * 1.1;
  const x = (index: number) => count <= 1 ? WIDTH : (index / (count - 1)) * WIDTH;
  const y = (value: number) => HEIGHT - (Math.min(value, max) / max) * HEIGHT;

  const path = (values: (number | null)[]) => {
    let line = '';
    values.forEach((value, index) => {
      if (value === null || !Number.isFinite(value)) return;
      line += `${line && values[index - 1] !== null ? 'L' : 'M'}${x(index).toFixed(1)},${y(value).toFixed(1)} `;
    });
    return line;
  };

  const shown = hover ?? count - 1;
  const onMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.round(((event.clientX - rect.left) / rect.width) * (count - 1));
    setHover(count > 1 ? Math.max(0, Math.min(count - 1, index)) : null);
  };

  return (
    <div className="server-chart">
      <div className="server-chart-title">
        <span>{props.title}</span>
        <span className="server-chart-time">{shown >= 0 && props.times[shown] ? new Date(props.times[shown]).toLocaleTimeString() : ''}</span>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={props.title}>
        {[0.25, 0.5, 0.75].map((part) => <line key={part} x1={0} x2={WIDTH} y1={HEIGHT * part} y2={HEIGHT * part} className="grid" />)}
        {props.series.map((serie) => (
          <path key={serie.label} d={path(serie.values)} stroke={serie.color} fill="none" strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={HEIGHT} className="cursor" />}
      </svg>
      <div className="server-chart-legend">
        {props.series.map((serie) => {
          const value = shown >= 0 ? serie.values[shown] : null;
          return (
            <span key={serie.label}>
              <i style={{backgroundColor: serie.color}} />
              {serie.label} <strong>{value === null || value === undefined || !Number.isFinite(value) ? '–' : props.format(value)}</strong>
            </span>
          );
        })}
        <span className="server-chart-max">max {props.format(props.max ?? Math.max(0, ...all))}</span>
      </div>
    </div>
  );
}
