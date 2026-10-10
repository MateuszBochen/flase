import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import ApplicationInterface from '../ApplicationInterface';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import TableManager from '../../../Library/Table/TableManager';
import EventBus from '../../../Library/EventBus/EventBus';
import TableInformationWasReceived from '../../../Library/Table/Event/TableInformationWasReceived';
import TableInformationInterface from '../../../Library/Table/Interface/TableInformationInterface';
import NewTabComponentWasSelected from '../../ApplicationRenderer/Event/NewTabComponentWasSelected';
import TableRecords from '../TableRecords/TableRecords';
import TableRecordsPropsInterface from '../TableRecords/Interface/TableRecordsPropsInterface';
import {autoLayout, BoxType, HEADER_HEIGHT, relationsOf, ROW_HEIGHT} from './ErLayout';
import './style.css';

export interface ErDiagramPropsInterface extends ApplicationInterface {
  connection: ConnectionDataInterface;
  database: string;
}

type PositionsType = {[table: string]: {x: number, y: number}};
type DragType = {kind: 'table', table: string, startX: number, startY: number, boxX: number, boxY: number}
  | {kind: 'pan', startX: number, startY: number, panX: number, panY: number};

const storageKey = (connection: ConnectionDataInterface, database: string) => `er_positions:${connection.id}:${database}`;

const loadPositions = (key: string): PositionsType => {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch (e) {
    return {};
  }
};

/** ErDiagram - tables of database with foreign keys, tables can be moved, positions are remembered */
export default (props: ErDiagramPropsInterface) => {
  const tableManager = TableManager.getInstance();
  const key = storageKey(props.connection, props.database);
  const listTables = () => tableManager.getTablesListForDatabase(props.connection, {name: props.database})
    .filter((table) => !table.preload);
  const [tables, setTables] = useState<TableInformationInterface[]>(listTables());
  const [positions, setPositions] = useState<PositionsType>(() => loadPositions(key));
  const [pan, setPan] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [zoom, setZoom] = useState<number>(1);
  const [hovered, setHovered] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('');
  const drag = useRef<DragType | null>(null);
  const moved = useRef<boolean>(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    const eventId = EventBus.subscribe(TableInformationWasReceived.name, () => setTables(listTables()));
    tableManager.askForTableList(props.connection, {name: props.database}, false);
    return () => EventBus.unSub(eventId);
  }, [props.connection, props.database]);

  const shownTables = useMemo(() => {
    if (!filter.trim()) return tables;
    const term = filter.trim().toLowerCase();
    // matching tables and tables related to them
    const matching = new Set(tables.filter((table) => table.tableName.toLowerCase().includes(term)).map((table) => table.tableName));
    const relations = relationsOf(tables);
    relations.forEach((relation) => {
      if (matching.has(relation.from) || matching.has(relation.to)) {
        matching.add(relation.from);
        matching.add(relation.to);
      }
    });
    return tables.filter((table) => matching.has(table.tableName));
  }, [tables, filter]);

  const relations = useMemo(() => relationsOf(shownTables), [shownTables]);
  const layout = useMemo(() => autoLayout(shownTables, relations), [shownTables, relations]);
  /** saved position wins over automatic one */
  const boxes = useMemo(() => {
    const result: {[table: string]: BoxType} = {};
    Object.entries(layout).forEach(([name, box]) => {
      result[name] = positions[name] && !filter.trim() ? {...box, ...positions[name]} : box;
    });
    return result;
  }, [layout, positions, filter]);

  const savePositions = (next: PositionsType) => {
    setPositions(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch (e) {
      // positions are only convenience
    }
  };

  const onMouseDown = (event: React.MouseEvent, table?: string) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    moved.current = false;
    drag.current = table
      ? {kind: 'table', table, startX: event.clientX, startY: event.clientY, boxX: boxes[table].x, boxY: boxes[table].y}
      : {kind: 'pan', startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y};
  };

  const onMouseMove = (event: React.MouseEvent) => {
    const current = drag.current;
    if (!current) return;
    const dx = event.clientX - current.startX;
    const dy = event.clientY - current.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved.current = true;
    if (current.kind === 'pan') {
      setPan({x: current.panX + dx, y: current.panY + dy});
    } else {
      setPositions((previous) => ({...previous, [current.table]: {x: Math.round(current.boxX + dx / zoom), y: Math.round(current.boxY + dy / zoom)}}));
    }
  };

  const onMouseUp = () => {
    if (drag.current?.kind === 'table' && moved.current) {
      savePositions(positions);
    }
    drag.current = null;
  };

  /** zoom to mouse position */
  const onWheel = (event: React.WheelEvent) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const next = Math.min(2.5, Math.max(0.2, zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
    setPan({x: mouseX - (mouseX - pan.x) * next / zoom, y: mouseY - (mouseY - pan.y) * next / zoom});
    setZoom(next);
  };

  const fit = useCallback(() => {
    const all = Object.values(boxes);
    if (!all.length || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const right = Math.max(...all.map((box) => box.x + box.width)) + 20;
    const bottom = Math.max(...all.map((box) => box.y + box.height)) + 20;
    const next = Math.min(1.5, Math.max(0.2, Math.min(rect.width / right, rect.height / bottom)));
    setZoom(next);
    setPan({x: 0, y: 0});
  }, [boxes]);

  const openTable = (table: TableInformationInterface) => {
    EventBus.emit(new NewTabComponentWasSelected<TableRecordsPropsInterface>({
      component: TableRecords,
      props: {connection: props.connection, database: {name: props.database}, table},
      tabName: `${props.database}/${table.tableName}`,
      isActive: false,
      activate: true,
    }));
  };

  /** diagram as SVG file - styles are written into the file */
  const exportSvg = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const all = Object.values(boxes);
    const width = Math.max(...all.map((box) => box.x + box.width)) + 20;
    const height = Math.max(...all.map((box) => box.y + box.height)) + 20;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    clone.querySelector('.er-viewport')?.setAttribute('transform', '');
    const computed = getComputedStyle(svg.parentElement!);
    const style = document.createElementNS('http://www.w3.org/2000/svg', 'style');
    style.textContent = `text{font-family:monospace;font-size:12px}.er-table-bg{fill:${computed.getPropertyValue('--er-table-bg') || '#3c3f41'};stroke:#555}`
      + `.er-header{fill:${computed.getPropertyValue('--er-header-bg') || '#4b6eaf'}}.er-title{fill:#fff;font-weight:bold}.er-column{fill:#bbb}.er-type{fill:#888}`
      + '.er-pk{fill:#ffc66d}.er-fk{fill:#6897bb}.er-relation{fill:none;stroke:#888;stroke-width:1.3}';
    clone.insertBefore(style, clone.firstChild);
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], {type: 'image/svg+xml'});
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${props.database}-er.svg`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  /** line from column of referencing table to column of referenced one, from the nearer side */
  const relationPath = (from: BoxType, fromRow: number, to: BoxType, toRow: number): string => {
    const y1 = from.y + HEADER_HEIGHT + fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
    const y2 = to.y + HEADER_HEIGHT + toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
    const fromRight = from.x + from.width / 2 < to.x + to.width / 2;
    const x1 = fromRight ? from.x + from.width : from.x;
    const x2 = fromRight ? to.x : to.x + to.width;
    if (from === to) {
      // self reference - loop on the right side
      return `M ${from.x + from.width} ${y1} C ${from.x + from.width + 50} ${y1}, ${from.x + from.width + 50} ${y2}, ${from.x + from.width} ${y2}`;
    }
    const bend = Math.max(40, Math.abs(x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + (fromRight ? bend : -bend)} ${y1}, ${x2 + (fromRight ? -bend : bend)} ${y2}, ${x2} ${y2}`;
  };

  const isRelatedToHovered = (relation: {from: string, to: string}) => !!hovered && (relation.from === hovered || relation.to === hovered);

  return (
    <div className="cmp-er-diagram">
      <div className="er-toolbar">
        <span className="er-title-text">{props.database}</span>
        <span className="er-count">{shownTables.length} tables · {relations.length} relations</span>
        <input placeholder="Filter (with related tables)" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button type="button" onClick={fit}>Fit</button>
        <button type="button" onClick={() => { setZoom(1); setPan({x: 0, y: 0}); }}>100%</button>
        <button type="button" title="Forget moved positions" onClick={() => savePositions({})}>Auto layout</button>
        <button type="button" onClick={exportSvg}>Export SVG</button>
        <span className="er-hint">Drag tables or background, wheel zooms, click opens table</span>
      </div>
      <svg
        ref={svgRef}
        className="er-canvas"
        onMouseDown={(event) => onMouseDown(event)}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onWheel={onWheel}
      >
        <defs>
          <marker id="er-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="er-arrow" />
          </marker>
        </defs>
        <g className="er-viewport" transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {relations.map((relation, index) => {
            const from = boxes[relation.from];
            const to = boxes[relation.to];
            const fromTable = shownTables.find((table) => table.tableName === relation.from)!;
            const toTable = shownTables.find((table) => table.tableName === relation.to)!;
            if (!from || !to) return null;
            const fromRow = Math.max(0, fromTable.columns.findIndex((column) => column.name === relation.fromColumn));
            const toRow = Math.max(0, toTable.columns.findIndex((column) => column.name === relation.toColumn));
            return (
              <path
                key={index}
                className={`er-relation ${isRelatedToHovered(relation) ? 'highlight' : ''} ${hovered && !isRelatedToHovered(relation) ? 'dimmed' : ''}`}
                d={relationPath(from, fromRow, to, toRow)}
                markerEnd="url(#er-arrow)"
              >
                <title>{`${relation.from}.${relation.fromColumn} → ${relation.to}.${relation.toColumn}`}</title>
              </path>
            );
          })}
          {shownTables.map((table) => {
            const box = boxes[table.tableName];
            if (!box) return null;
            return (
              <g
                key={table.tableName}
                className={`er-table ${hovered === table.tableName ? 'hovered' : ''}`}
                transform={`translate(${box.x} ${box.y})`}
                onMouseDown={(event) => onMouseDown(event, table.tableName)}
                onMouseEnter={() => setHovered(table.tableName)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => !moved.current && openTable(table)}
              >
                <rect className="er-table-bg" width={box.width} height={box.height} rx={4} />
                <rect className="er-header" width={box.width} height={HEADER_HEIGHT} rx={4} />
                <text className="er-title" x={8} y={17}>{table.tableName}</text>
                {table.columns.map((column, index) => (
                  <g key={column.name} transform={`translate(0 ${HEADER_HEIGHT + index * ROW_HEIGHT})`}>
                    <text className={column.primaryKey ? 'er-pk' : column.reference ? 'er-fk' : 'er-column'} x={8} y={13}>
                      {column.primaryKey ? '🔑 ' : column.reference ? '↗ ' : '   '}{column.name}{column.nullable ? '' : ' *'}
                    </text>
                    <text className="er-type" x={box.width - 8} y={13} textAnchor="end">{column.type}</text>
                  </g>
                ))}
              </g>
            );
          })}
        </g>
      </svg>
      {!tables.length && <div className="er-empty">Loading tables…</div>}
    </div>
  );
}
