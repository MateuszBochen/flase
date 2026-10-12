import React, {useEffect, useMemo, useRef, useState} from 'react';
import Popup from '../../../UI/Popup/Popup';
import Button from '../../../UI/Button/Button';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {SingleRowType} from '../Interface/RecordsViewPropsInterface';
import {GeometryType, parseGeometry, PositionType, positionsOf, SPATIAL_TYPE} from './geometry';
import './style.css';

interface MapPopupPropsInterface {
  columns: ColumnInterface[];
  rows: SingleRowType[];
  name: string;
  onClose: () => void;
}

const WIDTH = 880;
const HEIGHT = 500;
const PADDING = 40;
const TILE = 256;
const MAX_ZOOM = 19;

/** columns with spatial type or values which are geometries (WKT, GeoJSON) */
export const spatialColumns = (columns: ColumnInterface[], rows: SingleRowType[]): ColumnInterface[] => columns.filter((column) => {
  if (SPATIAL_TYPE.test(column.type || '')) return true;
  const values = rows.map((row) => row[column.key]).filter((value) => value !== null && value !== undefined && value !== '').slice(0, 50);
  return values.length > 0 && values.every((value) => parseGeometry(value, column.type) !== null);
});

const cellText = (value: any): string => value === null || value === undefined ? 'NULL' : typeof value === 'object' ? JSON.stringify(value) : String(value);

/** longitude / latitude to pixels of Web Mercator world at zoom */
const mercator = ([lon, lat]: PositionType, zoom: number): PositionType => {
  const size = TILE * 2 ** zoom;
  const latitude = Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI / 180;
  return [(lon + 180) / 360 * size, (1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 * size];
};

/** MapPopup - geometries of result on map (OpenStreetMap background for longitude / latitude), label and values of row */
export default (props: MapPopupPropsInterface) => {
  const spatial = useMemo(() => spatialColumns(props.columns, props.rows), [props.columns, props.rows]);
  const [geometryKey, setGeometryKey] = useState<string>(spatial[0]?.key || '');
  const textColumns = props.columns.filter((column) => !spatial.includes(column));
  const [labelKey, setLabelKey] = useState<string>((textColumns.find((column) => !/int|serial|uuid/i.test(column.type || '') && !column.primaryKey) || textColumns[0])?.key || '');
  const [selected, setSelected] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const geometryColumn = spatial.find((column) => column.key === geometryKey) || spatial[0];

  const features = useMemo(() => props.rows
    .map((row, index) => ({index, row, geometry: geometryColumn ? parseGeometry(row[geometryColumn.key], geometryColumn.type) : null}))
    .filter((feature): feature is {index: number, row: SingleRowType, geometry: GeometryType} => !!feature.geometry),
  [props.rows, geometryColumn]);

  const positions = useMemo(() => features.flatMap((feature) => positionsOf(feature.geometry)).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)), [features]);
  const bounds = useMemo(() => positions.length ? {
    minX: Math.min(...positions.map((position) => position[0])),
    maxX: Math.max(...positions.map((position) => position[0])),
    minY: Math.min(...positions.map((position) => position[1])),
    maxY: Math.max(...positions.map((position) => position[1])),
  } : null, [positions]);
  /** coordinates look like longitude / latitude - map projection and tiles */
  const geographic = !!bounds && bounds.minX >= -180 && bounds.maxX <= 180 && bounds.minY >= -85.06 && bounds.maxY <= 85.06;
  const [background, setBackground] = useState<boolean>(true);

  /** cartesian - scale fitting bounds at zoom 0 */
  const baseScale = useMemo(() => {
    if (!bounds) return 1;
    const width = bounds.maxX - bounds.minX;
    const height = bounds.maxY - bounds.minY;
    if (!width && !height) return 1;
    return Math.min(width ? (WIDTH - 2 * PADDING) / width : Infinity, height ? (HEIGHT - 2 * PADDING) / height : Infinity);
  }, [bounds]);

  const project = (position: PositionType, zoom: number): PositionType => geographic
    ? mercator(position, zoom)
    : [(position[0] - (bounds?.minX || 0)) * baseScale * 2 ** zoom, ((bounds?.maxY || 0) - position[1]) * baseScale * 2 ** zoom];

  /** zoom and center showing all geometries */
  const fitView = (): {zoom: number, center: PositionType} => {
    if (!bounds) return {zoom: 0, center: [0, 0]};
    let zoom = 0;
    if (geographic) {
      zoom = 12;
      for (let candidate = MAX_ZOOM - 3; candidate >= 0; candidate--) {
        const [left, bottom] = mercator([bounds.minX, bounds.minY], candidate);
        const [right, top] = mercator([bounds.maxX, bounds.maxY], candidate);
        if (right - left <= WIDTH - 2 * PADDING && bottom - top <= HEIGHT - 2 * PADDING) {
          zoom = bounds.maxX === bounds.minX && bounds.maxY === bounds.minY ? 12 : candidate;
          break;
        }
      }
    }
    const [x1, y1] = project([bounds.minX, bounds.minY], zoom);
    const [x2, y2] = project([bounds.maxX, bounds.maxY], zoom);
    return {zoom, center: [(x1 + x2) / 2, (y1 + y2) / 2]};
  };
  const [view, setView] = useState<{zoom: number, center: PositionType}>(fitView);
  const drag = useRef<{x: number, y: number, center: PositionType, moved: boolean} | null>(null);
  // other geometry column - its geometries are shown whole
  const fitted = useRef<string>(geometryColumn?.key || '');
  useEffect(() => {
    if (fitted.current !== (geometryColumn?.key || '')) {
      fitted.current = geometryColumn?.key || '';
      setView(fitView());
    }
  }, [geometryColumn?.key, bounds]);

  const toScreen = (position: PositionType): PositionType => {
    const [x, y] = project(position, view.zoom);
    return [x - view.center[0] + WIDTH / 2, y - view.center[1] + HEIGHT / 2];
  };
  const pathOf = (rings: PositionType[][], close: boolean) => rings.map((ring) => ring.map((position, index) => {
    const [x, y] = toScreen(position);
    return `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + (close ? ' Z' : '')).join(' ');

  const zoomBy = (delta: number, at: PositionType = [WIDTH / 2, HEIGHT / 2]) => setView((previous) => {
    const zoom = Math.max(geographic ? 0 : -6, Math.min(MAX_ZOOM, previous.zoom + delta));
    const factor = 2 ** (zoom - previous.zoom);
    const offset: PositionType = [at[0] - WIDTH / 2, at[1] - HEIGHT / 2];
    // point under mouse stays in place
    return {zoom, center: [(previous.center[0] + offset[0]) * factor - offset[0], (previous.center[1] + offset[1]) * factor - offset[1]]};
  });

  const tiles = () => {
    if (!geographic || !background) return [];
    const count = 2 ** view.zoom;
    const left = Math.floor((view.center[0] - WIDTH / 2) / TILE);
    const right = Math.floor((view.center[0] + WIDTH / 2) / TILE);
    const top = Math.max(0, Math.floor((view.center[1] - HEIGHT / 2) / TILE));
    const bottom = Math.min(count - 1, Math.floor((view.center[1] + HEIGHT / 2) / TILE));
    const result: {key: string, href: string, x: number, y: number}[] = [];
    for (let tileX = left; tileX <= right; tileX++) {
      for (let tileY = top; tileY <= bottom; tileY++) {
        const wrapped = ((tileX % count) + count) % count;
        result.push({
          key: `${view.zoom}/${tileX}/${tileY}`,
          href: `https://tile.openstreetmap.org/${view.zoom}/${wrapped}/${tileY}.png`,
          x: tileX * TILE - view.center[0] + WIDTH / 2,
          y: tileY * TILE - view.center[1] + HEIGHT / 2,
        });
      }
    }
    return result;
  };

  const shape = (geometry: GeometryType, index: number, active: boolean): React.ReactNode => {
    const className = `map-feature ${active ? 'active' : ''}`;
    switch (geometry.type) {
      case 'Point': {
        const [x, y] = toScreen(geometry.coordinates);
        return <circle className={`${className} point`} cx={x} cy={y} r={active ? 7 : 5} />;
      }
      case 'MultiPoint':
        return geometry.coordinates.map((position, item) => {
          const [x, y] = toScreen(position);
          return <circle key={item} className={`${className} point`} cx={x} cy={y} r={active ? 7 : 5} />;
        });
      case 'LineString': return <path className={`${className} line`} d={pathOf([geometry.coordinates], false)} />;
      case 'MultiLineString': return <path className={`${className} line`} d={pathOf(geometry.coordinates, false)} />;
      case 'Polygon': return <path className={`${className} polygon`} d={pathOf(geometry.coordinates, true)} fillRule="evenodd" />;
      case 'MultiPolygon': return <path className={`${className} polygon`} d={geometry.coordinates.map((polygon) => pathOf(polygon, true)).join(' ')} fillRule="evenodd" />;
      case 'GeometryCollection': return geometry.geometries.map((item, itemIndex) => <g key={itemIndex}>{shape(item, index, active)}</g>);
    }
  };

  const label = (row: SingleRowType) => labelKey ? cellText(row[labelKey]) : '';
  const selectedFeature = features.find((feature) => feature.index === selected);

  const exportSvg = (svg: SVGSVGElement | null) => {
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = '.point{fill:#3574f0;stroke:#fff;stroke-width:1.5}.line{fill:none;stroke:#d9534f;stroke-width:2.5}'
      + '.polygon{fill:rgba(53,116,240,.25);stroke:#3574f0;stroke-width:1.5}.map-label{font:12px sans-serif;fill:#222}.map-grid{stroke:#ddd}';
    clone.insertBefore(style, clone.firstChild);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], {type: 'image/svg+xml'}));
    link.download = `${props.name}-map.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };
  const svgRef = useRef<SVGSVGElement | null>(null);

  return (
    <Popup
      openOnMount
      label={`Map of ${props.name}`}
      onClickOk={props.onClose}
      onClose={props.onClose}
      buttons={[
        <Button key="svg" size="small" label="Export SVG" onClick={() => exportSvg(svgRef.current)} disabled={!features.length} />,
        <Button key="close" size="small" label="Close" onClick={props.onClose} />,
      ]}
    >
      <div className="cmp-result-map">
        <div className="map-toolbar">
          <label>Geometry
            <select value={geometryColumn?.key || ''} onChange={(event) => { setGeometryKey(event.target.value); setSelected(null); }} aria-label="Geometry column">
              {spatial.map((column) => <option key={column.key} value={column.key}>{column.name}{column.type ? ` (${column.type})` : ''}</option>)}
            </select>
          </label>
          <label>Label
            <select value={labelKey} onChange={(event) => setLabelKey(event.target.value)} aria-label="Label column">
              <option value="">—</option>
              {textColumns.map((column) => <option key={column.key} value={column.key}>{column.name}</option>)}
            </select>
          </label>
          {geographic && (
            <label className="checkbox">
              <input type="checkbox" checked={background} onChange={(event) => setBackground(event.target.checked)} />
              OpenStreetMap
            </label>
          )}
          <span className="map-count">{features.length} of {props.rows.length} rows with geometry · {geographic ? 'longitude / latitude' : 'plane coordinates'}</span>
          <span className="map-zoom">
            <button type="button" onClick={() => zoomBy(1)} aria-label="Zoom in">+</button>
            <button type="button" onClick={() => zoomBy(-1)} aria-label="Zoom out">−</button>
            <button type="button" onClick={() => setView(fitView())} aria-label="Fit">Fit</button>
          </span>
        </div>
        <div className="map-body">
          <svg
            ref={svgRef}
            className="map-canvas"
            width={WIDTH}
            height={HEIGHT}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            onMouseDown={(event) => { drag.current = {x: event.clientX, y: event.clientY, center: view.center, moved: false}; }}
            onMouseMove={(event) => {
              const current = drag.current;
              if (!current) return;
              const dx = event.clientX - current.x;
              const dy = event.clientY - current.y;
              if (Math.abs(dx) + Math.abs(dy) > 3) current.moved = true;
              setView((previous) => ({...previous, center: [current.center[0] - dx, current.center[1] - dy]}));
            }}
            onMouseUp={() => { drag.current = null; }}
            onMouseLeave={() => { drag.current = null; }}
            onWheel={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              zoomBy(event.deltaY < 0 ? 1 : -1, [(event.clientX - rect.left) * WIDTH / rect.width, (event.clientY - rect.top) * HEIGHT / rect.height]);
            }}
          >
            {!geographic && Array.from({length: 11}, (item, index) => (
              <g key={index}>
                <line className="map-grid" x1={(index * WIDTH) / 10} x2={(index * WIDTH) / 10} y1={0} y2={HEIGHT} />
                <line className="map-grid" x1={0} x2={WIDTH} y1={(index * HEIGHT) / 10} y2={(index * HEIGHT) / 10} />
              </g>
            ))}
            {tiles().map((tile) => <image key={tile.key} href={tile.href} x={tile.x} y={tile.y} width={TILE} height={TILE} className="map-tile" />)}
            {features.map((feature) => (
              <g
                key={feature.index}
                data-row={feature.index}
                className="map-item"
                onMouseEnter={() => setHovered(feature.index)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => !drag.current?.moved && setSelected(feature.index === selected ? null : feature.index)}
              >
                {shape(feature.geometry, feature.index, feature.index === selected || feature.index === hovered)}
                <title>{label(feature.row) || `row ${feature.index + 1}`}</title>
              </g>
            ))}
            {labelKey && features.map((feature) => {
              const [first] = positionsOf(feature.geometry);
              if (!first) return null;
              const [x, y] = toScreen(first);
              return <text key={`label-${feature.index}`} className="map-label" x={x + 8} y={y - 6}>{label(feature.row)}</text>;
            })}
          </svg>
          {geographic && background && <div className="map-attribution">© OpenStreetMap contributors</div>}
          {!features.length && <div className="map-empty">No geometry in {geometryColumn?.name || 'result'}</div>}
          {selectedFeature && (
            <div className="map-details">
              <strong>Row {selectedFeature.index + 1}</strong>
              <table>
                <tbody>
                  {props.columns.map((column) => (
                    <tr key={column.key}>
                      <th>{column.name}</th>
                      <td>{cellText(selectedFeature.row[column.key])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Popup>
  );
}
