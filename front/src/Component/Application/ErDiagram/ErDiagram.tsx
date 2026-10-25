import React, {memo, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import ApplicationInterface from '../ApplicationInterface';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import TableManager from '../../../Library/Table/TableManager';
import EventBus from '../../../Library/EventBus/EventBus';
import TableInformationWasReceived from '../../../Library/Table/Event/TableInformationWasReceived';
import TableInformationInterface from '../../../Library/Table/Interface/TableInformationInterface';
import NewTabComponentWasSelected from '../../ApplicationRenderer/Event/NewTabComponentWasSelected';
import TableRecords from '../TableRecords/TableRecords';
import TableRecordsPropsInterface from '../TableRecords/Interface/TableRecordsPropsInterface';
import {autoLayout, BoxType, HEADER_HEIGHT, relationsOf, RelationType, ROW_HEIGHT} from './ErLayout';
import ContextMenu, {ContextMenuItem} from '../../../UI/ContextMenu/ContextMenu';
import useConnectionSettings from '../../../Library/Connection/useConnectionSettings';
import useStructureChange from '../TableRecords/Structure/useStructureChange';
import SqlConfirmPopup from '../TableRecords/Structure/SqlConfirmPopup';
import ForeignKeyForm from '../TableRecords/Structure/ForeignKeyForm';
import openTableTab from '../TableRecords/openTableTab';
import '../TableRecords/Structure/style.css';
import ErTable, {ErTableHandlersInterface} from './ErTable';
import './style.css';

export interface ErDiagramPropsInterface extends ApplicationInterface {
  connection: ConnectionDataInterface;
  database: string;
}

type PositionsType = {[table: string]: {x: number, y: number}};
type DragType = {kind: 'table', table: string, startX: number, startY: number, boxX: number, boxY: number}
  | {kind: 'pan', startX: number, startY: number, panX: number, panY: number};

const storageKey = (connection: ConnectionDataInterface, database: string) => `er_positions:${connection.id}:${database}`;

/** bounds = rectangle of both tables, the line is inside it */
type RelationLineType = {relation: RelationType, path: string, bounds: BoxType};

/** tables and lines this far (pixels of screen) out of the visible part are rendered too - no empty edge while panning */
const VIEWPORT_MARGIN = 300;

const intersects = (box: BoxType, area: {left: number, top: number, right: number, bottom: number}) =>
  box.x <= area.right && box.x + box.width >= area.left && box.y <= area.bottom && box.y + box.height >= area.top;

/** lines of relations - re-rendered only when tables moved or hovered table changed, not by pan and zoom */
const ErRelations = memo((props: {
  lines: RelationLineType[],
  hovered: string | null,
  onContextMenu: (event: React.MouseEvent, relation: RelationType) => void,
}) => {
  const {hovered} = props;
  const isRelatedToHovered = (relation: RelationType) => !!hovered && (relation.from === hovered || relation.to === hovered);
  return (
    <>
      {props.lines.map(({relation, path}, index) => (
        <g key={index} onContextMenu={(event) => props.onContextMenu(event, relation)}>
          <path
            className={`er-relation ${isRelatedToHovered(relation) ? 'highlight' : ''} ${hovered && !isRelatedToHovered(relation) ? 'dimmed' : ''}`}
            d={path}
            markerEnd="url(#er-arrow)"
          />
          {/* wide invisible line - easier to hit with mouse */}
          <path className="er-relation-hit" d={path} data-relation={`${relation.from}.${relation.fromColumn}`}>
            <title>{`${relation.from}.${relation.fromColumn} → ${relation.to}.${relation.toColumn}${relation.constraint ? ` (${relation.constraint})` : ''}`}</title>
          </path>
        </g>
      ))}
    </>
  );
});

/** line from column of referencing table to column of referenced one, from the nearer side */
const relationPath = (from: BoxType, fromRow: number, to: BoxType, toRow: number, self: boolean): string => {
  const y1 = from.y + HEADER_HEIGHT + fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
  const y2 = to.y + HEADER_HEIGHT + toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
  const fromRight = from.x + from.width / 2 < to.x + to.width / 2;
  const x1 = fromRight ? from.x + from.width : from.x;
  const x2 = fromRight ? to.x : to.x + to.width;
  if (self) {
    // self reference - loop on the right side
    return `M ${from.x + from.width} ${y1} C ${from.x + from.width + 50} ${y1}, ${from.x + from.width + 50} ${y2}, ${from.x + from.width} ${y2}`;
  }
  const bend = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + (fromRight ? bend : -bend)} ${y1}, ${x2 + (fromRight ? -bend : bend)} ${y2}, ${x2} ${y2}`;
};

const loadPositions = (key: string): PositionsType => {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch (e) {
    return {};
  }
};

/** ErDiagram - tables of database with foreign keys, tables can be moved, positions are remembered */
export default (props: ErDiagramPropsInterface) => {
  const connection = useConnectionSettings(props.connection);
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
  /** typing in filter does not wait for layout of thousands of tables */
  const deferredFilter = useDeferredValue(filter);
  const drag = useRef<DragType | null>(null);
  const moved = useRef<boolean>(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  /** click on column starts relation, click on column of other table finishes it */
  const [linkMode, setLinkMode] = useState<boolean>(false);
  const [linkSource, setLinkSource] = useState<{table: string, column: string} | null>(null);
  const [foreignKey, setForeignKey] = useState<{table: string, column: string, referencedTable: string, referencedColumn: string} | null>(null);
  const [menu, setMenu] = useState<{x: number, y: number, items: ContextMenuItem[]} | null>(null);
  /** table changed by relation form or drop of relation */
  const [changedTable, setChangedTable] = useState<string>('');
  const change = useStructureChange(props.connection, {databaseName: props.database, name: changedTable}, `${props.tabId}:er-change`, () => {
    setForeignKey(null);
    tableManager.askForTableList(props.connection, {name: props.database}, true);
  });

  const onColumnClick = (event: React.MouseEvent, table: string, column: string) => {
    if (!linkMode) return;
    event.stopPropagation();
    if (!linkSource) {
      setLinkSource({table, column});
    } else if (linkSource.table === table && linkSource.column === column) {
      setLinkSource(null);
    } else {
      setChangedTable(linkSource.table);
      setForeignKey({table: linkSource.table, column: linkSource.column, referencedTable: table, referencedColumn: column});
      setLinkSource(null);
    }
  };

  const relationMenu = (event: React.MouseEvent, relation: RelationType) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({x: event.clientX, y: event.clientY, items: [
      {label: `Open ${relation.from}`, onClick: () => openTableTab(props.connection, {databaseName: props.database, name: relation.from}, {newTab: true})},
      {label: `Open ${relation.to}`, onClick: () => openTableTab(props.connection, {databaseName: props.database, name: relation.to}, {newTab: true})},
      'separator',
      {
        label: relation.constraint ? `Drop foreign key ${relation.constraint}…` : 'Drop foreign key…',
        danger: true,
        disabled: !relation.constraint || !!connection.readOnly,
        onClick: () => {
          setChangedTable(relation.from);
          // hook is bound to table of the change - request after it was rendered for the table
          setTimeout(() => pendingDrop.current?.(relation.constraint!));
        },
      },
    ]});
  };
  const pendingDrop = useRef<((name: string) => void) | null>(null);
  pendingDrop.current = (name: string) => change.requestPreview({kind: 'alter', operations: [{op: 'dropForeignKey', name}]});

  useEffect(() => {
    const eventId = EventBus.subscribe(TableInformationWasReceived.name, () => setTables(listTables()));
    tableManager.askForTableList(props.connection, {name: props.database}, false);
    return () => EventBus.unSub(eventId);
  }, [props.connection, props.database]);

  const shownTables = useMemo(() => {
    if (!deferredFilter.trim()) return tables;
    const term = deferredFilter.trim().toLowerCase();
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
  }, [tables, deferredFilter]);

  const relations = useMemo(() => relationsOf(shownTables), [shownTables]);
  const layout = useMemo(() => autoLayout(shownTables, relations), [shownTables, relations]);
  /** saved position wins over automatic one */
  const boxes = useMemo(() => {
    const result: {[table: string]: BoxType} = {};
    Object.entries(layout).forEach(([name, box]) => {
      result[name] = positions[name] && !deferredFilter.trim() ? {...box, ...positions[name]} : box;
    });
    return result;
  }, [layout, positions, deferredFilter]);

  const tableByName = useMemo(() => new Map(shownTables.map((table) => [table.tableName, table])), [shownTables]);
  const lines = useMemo((): RelationLineType[] => relations.flatMap((relation) => {
    const from = boxes[relation.from];
    const to = boxes[relation.to];
    const fromTable = tableByName.get(relation.from);
    const toTable = tableByName.get(relation.to);
    if (!from || !to || !fromTable || !toTable) return [];
    const fromRow = Math.max(0, fromTable.columns.findIndex((column) => column.name === relation.fromColumn));
    const toRow = Math.max(0, toTable.columns.findIndex((column) => column.name === relation.toColumn));
    const x = Math.min(from.x, to.x);
    const y = Math.min(from.y, to.y);
    const bounds = {x, y, width: Math.max(from.x + from.width, to.x + to.width) - x, height: Math.max(from.y + from.height, to.y + to.height) - y};
    return [{relation, path: relationPath(from, fromRow, to, toRow, relation.from === relation.to), bounds}];
  }), [relations, boxes, tableByName]);

  /**
   * only tables and lines in visible part of canvas are rendered - layout of SVG with thousands of tables
   * takes seconds on every pan, zoom and hover; export renders all of them
   */
  const [canvasSize, setCanvasSize] = useState<{width: number, height: number}>({width: 0, height: 0});
  const [exporting, setExporting] = useState<boolean>(false);
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const measure = () => {
      const rect = svg.getBoundingClientRect();
      setCanvasSize((previous) => previous.width === rect.width && previous.height === rect.height ? previous : {width: rect.width, height: rect.height});
    };
    measure();
    let frame: number | null = null;
    // in next frame - state changed in callback would change layout in the same frame (ResizeObserver loop)
    const observer = new ResizeObserver(() => {
      if (frame === null) frame = requestAnimationFrame(() => { frame = null; measure(); });
    });
    observer.observe(svg);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);
  const visibleArea = exporting ? null : {
    left: (-pan.x - VIEWPORT_MARGIN) / zoom,
    top: (-pan.y - VIEWPORT_MARGIN) / zoom,
    right: (canvasSize.width - pan.x + VIEWPORT_MARGIN) / zoom,
    bottom: (canvasSize.height - pan.y + VIEWPORT_MARGIN) / zoom,
  };
  const visibleTables = visibleArea ? shownTables.filter((table) => boxes[table.tableName] && intersects(boxes[table.tableName], visibleArea)) : shownTables;
  const visibleLines = useMemo(
    () => visibleArea ? lines.filter((line) => intersects(line.bounds, visibleArea)) : lines,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, visibleArea?.left, visibleArea?.top, visibleArea?.right, visibleArea?.bottom],
  );

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
    // tables are not moved while relation is drawn
    if (linkMode && table) {
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
    moved.current = false;
    drag.current = table
      ? {kind: 'table', table, startX: event.clientX, startY: event.clientY, boxX: boxes[table].x, boxY: boxes[table].y}
      : {kind: 'pan', startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y};
  };

  /** position of dragged table for mouse position */
  const draggedPosition = (current: Extract<DragType, {kind: 'table'}>, clientX: number, clientY: number) => ({
    x: Math.round(current.boxX + (clientX - current.startX) / zoom),
    y: Math.round(current.boxY + (clientY - current.startY) / zoom),
  });

  /** mouse moves faster than diagram of thousands of tables renders - one change per frame */
  const lastMouse = useRef<{x: number, y: number} | null>(null);
  const moveFrame = useRef<number | null>(null);
  useEffect(() => () => {
    if (moveFrame.current !== null) cancelAnimationFrame(moveFrame.current);
  }, []);
  const applyMove = () => {
    moveFrame.current = null;
    const current = drag.current;
    const mouse = lastMouse.current;
    if (!current || !mouse) return;
    if (current.kind === 'pan') {
      setPan({x: current.panX + mouse.x - current.startX, y: current.panY + mouse.y - current.startY});
    } else {
      setPositions((previous) => ({...previous, [current.table]: draggedPosition(current, mouse.x, mouse.y)}));
    }
  };

  const onMouseMove = (event: React.MouseEvent) => {
    const current = drag.current;
    if (!current) return;
    if (Math.abs(event.clientX - current.startX) + Math.abs(event.clientY - current.startY) > 3) moved.current = true;
    lastMouse.current = {x: event.clientX, y: event.clientY};
    if (moveFrame.current === null) {
      moveFrame.current = requestAnimationFrame(applyMove);
    }
  };

  const onMouseUp = () => {
    const current = drag.current;
    if (moveFrame.current !== null) {
      cancelAnimationFrame(moveFrame.current);
      applyMove();
    }
    if (current?.kind === 'table' && moved.current) {
      // last move may not be rendered yet - final position from mouse
      const mouse = lastMouse.current;
      savePositions(mouse ? {...positions, [current.table]: draggedPosition(current, mouse.x, mouse.y)} : positions);
    }
    drag.current = null;
    lastMouse.current = null;
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

  /** callbacks given to memoized tables and relations read current state through ref */
  const handlersRef = useRef({onMouseDown, onColumnClick, openTable, relationMenu, linkMode});
  handlersRef.current = {onMouseDown, onColumnClick, openTable, relationMenu, linkMode};
  const tableHandlers: ErTableHandlersInterface = useMemo(() => ({
    onMouseDown: (event, table) => handlersRef.current.onMouseDown(event, table),
    onHover: setHovered,
    onClick: (table) => !moved.current && !handlersRef.current.linkMode && handlersRef.current.openTable(table),
    onColumnClick: (event, table, column) => handlersRef.current.onColumnClick(event, table, column),
  }), []);
  const onRelationMenu = useCallback((event: React.MouseEvent, relation: RelationType) => handlersRef.current.relationMenu(event, relation), []);

  /** diagram as SVG file - styles are written into the file; tables out of view are rendered first */
  useEffect(() => {
    if (!exporting) return;
    writeSvgFile();
    setExporting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exporting]);

  const writeSvgFile = () => {
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

  return (
    <div className="cmp-er-diagram">
      <div className="er-toolbar">
        <span className="er-title-text">{props.database}</span>
        <span className="er-count">{shownTables.length} tables · {relations.length} relations</span>
        <input placeholder="Filter (with related tables)" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button type="button" onClick={fit}>Fit</button>
        <button type="button" onClick={() => { setZoom(1); setPan({x: 0, y: 0}); }}>100%</button>
        <button type="button" title="Forget moved positions" onClick={() => savePositions({})}>Auto layout</button>
        <button type="button" onClick={() => setExporting(true)}>Export SVG</button>
        {!connection.readOnly && (
          <button
            type="button"
            className={linkMode ? 'active' : ''}
            onClick={() => { setLinkMode(!linkMode); setLinkSource(null); }}
            title="Click column of table with foreign key, then referenced column of other table"
          >
            {linkMode ? 'Cancel relation' : 'Add relation'}
          </button>
        )}
        <span className="er-hint">
          {linkMode
            ? (linkSource ? `${linkSource.table}.${linkSource.column} → click referenced column` : 'Click column which will reference other table')
            : 'Drag tables or background, wheel zooms, click opens table, right click on relation drops it'}
        </span>
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
          <ErRelations lines={visibleLines} hovered={hovered} onContextMenu={onRelationMenu} />
          {visibleTables.map((table) => {
            const box = boxes[table.tableName];
            if (!box) return null;
            return (
              <ErTable
                key={table.tableName}
                table={table}
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                hovered={hovered === table.tableName}
                linkMode={linkMode}
                selectedColumn={linkSource?.table === table.tableName ? linkSource.column : null}
                handlers={tableHandlers}
              />
            );
          })}
        </g>
      </svg>
      {!tables.length && <div className="er-empty">Loading tables…</div>}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {foreignKey && (
        <ForeignKeyForm
          connection={props.connection}
          table={{databaseName: props.database, name: foreignKey.table}}
          columns={tables.find((table) => table.tableName === foreignKey.table)?.columns.map((column) => column.name) || []}
          initial={{columns: [foreignKey.column], referencedTable: foreignKey.referencedTable, referencedColumns: [foreignKey.referencedColumn]}}
          busy={change.busy}
          onCancel={() => setForeignKey(null)}
          onPreview={(operation) => change.requestPreview({kind: 'alter', operations: [operation]})}
        />
      )}
      {change.preview && (
        <SqlConfirmPopup
          statements={change.preview.statements}
          change={change.preview.change}
          busy={change.busy}
          onExecute={change.execute}
          onCancel={change.closePreview}
        />
      )}
    </div>
  );
}
