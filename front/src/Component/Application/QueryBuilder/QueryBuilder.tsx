import React, {useEffect, useMemo, useRef, useState} from 'react';
import toast from 'react-hot-toast';
import {v4 as uuidv4} from 'uuid';
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter';
import {darcula, prism} from 'react-syntax-highlighter/dist/esm/styles/prism';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faArrowDown, faArrowUp, faCopy, faEraser, faEye, faPlay, faPlus, faTerminal, faWandMagicSparkles, faXmark} from '@fortawesome/free-solid-svg-icons';
import ApplicationInterface from '../ApplicationInterface';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import useConnectionSettings from '../../../Library/Connection/useConnectionSettings';
import DriverFactory from '../../../Library/Database/Driver/DriverFactory';
import TableManager from '../../../Library/Table/TableManager';
import EventBus from '../../../Library/EventBus/EventBus';
import TableInformationWasReceived from '../../../Library/Table/Event/TableInformationWasReceived';
import TableInformationInterface from '../../../Library/Table/Interface/TableInformationInterface';
import TabState from '../../../Library/Tabs/TabState';
import {useTheme} from '../../../Library/Theme/ThemeManager';
import ContextMenu, {ContextMenuItem} from '../../../UI/ContextMenu/ContextMenu';
import openConsole from '../../DatabaseOperations/openConsole';
import useDatabaseOperation from '../../DatabaseOperations/useDatabaseOperation';
import CreateViewPopup from '../../DatabaseOperations/CreateViewPopup';
import buildSql, {AGGREGATES, JoinKindType, OPERATORS, QbColumnInterface, QbJoinInterface, QbStateInterface, QbTableInterface} from './buildSql';
import './style.css';

export interface QueryBuilderPropsInterface extends ApplicationInterface {
  connection: ConnectionDataInterface;
  database: string;
}

const BOX_WIDTH = 210;
const HEADER = 26;
const ROW = 20;
const EMPTY: QbStateInterface = {tables: [], joins: [], columns: [], distinct: false, limit: '100'};

type DragType =
  | {kind: 'box', alias: string, startX: number, startY: number, boxX: number, boxY: number}
  | {kind: 'pan', startX: number, startY: number, panX: number, panY: number}
  | {kind: 'link', alias: string, column: string, x: number, y: number};

const newColumn = (alias: string, column: string): QbColumnInterface => ({
  id: uuidv4(), alias, column, as: '', show: true, aggregate: '', sort: '', operator: '', value: '',
});

/** QueryBuilder - tables on canvas with joins from foreign keys or drawn by mouse, grid of columns (filter, sort, aggregate), live SQL */
const QueryBuilder = (props: QueryBuilderPropsInterface) => {
  const connection = useConnectionSettings(props.connection);
  const driver = DriverFactory.getDriver(props.connection);
  const theme = useTheme();
  const tabId = props.tabId || `query-builder:${props.database}`;
  const tableManager = TableManager.getInstance();
  const listTables = () => tableManager.getTablesListForDatabase(props.connection, {name: props.database}).filter((table) => !table.preload);
  const [tables, setTables] = useState<TableInformationInterface[]>(listTables());
  const [state, setState] = useState<QbStateInterface>(() => ({...EMPTY, ...(TabState.get(tabId).queryBuilder || {})}));
  const [filter, setFilter] = useState<string>('');
  const [pan, setPan] = useState<{x: number, y: number}>({x: 0, y: 0});
  const [drag, setDrag] = useState<DragType | null>(null);
  const [menu, setMenu] = useState<{x: number, y: number, items: ContextMenuItem[]} | null>(null);
  const [viewSelect, setViewSelect] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const eventId = EventBus.subscribe(TableInformationWasReceived.name, () => setTables(listTables()));
    tableManager.askForTableList(props.connection, {name: props.database}, false);
    return () => EventBus.unSub(eventId);
  }, [props.connection, props.database]);

  /** state survives reload of page */
  const update = (changer: (previous: QbStateInterface) => QbStateInterface) => setState((previous) => {
    const next = changer(previous);
    TabState.update(tabId, {queryBuilder: next});
    return next;
  });

  const infoOf = (table: string) => tables.find((item) => item.tableName === table);
  const columnsOf = (table: string): string[] => infoOf(table)?.columns.map((column) => column.name) || [];

  const sql = useMemo(() => buildSql(state, {
    identifier: (name) => driver.sql.identifier(name),
    value: (value) => driver.sql.value(value),
  }), [state, driver]);

  const view = useDatabaseOperation(props.connection, `${tabId}:view`, (operation) => {
    setViewSelect(null);
    if (operation.kind === 'createView') tableManager.askForTableList(props.connection, {name: props.database}, true);
  });

  /** new table is joined by foreign key to a table already in query */
  const addTable = (table: string, position?: {x: number, y: number}) => update((previous) => {
    let alias = table;
    for (let index = 2; previous.tables.some((item) => item.alias === alias); index++) alias = `${table}_${index}`;
    const count = previous.tables.length;
    const box: QbTableInterface = {alias, table, x: position?.x ?? 20 + (count % 4) * (BOX_WIDTH + 60), y: position?.y ?? 20 + Math.floor(count / 4) * 220};
    const joins = [...previous.joins];
    const info = infoOf(table);
    for (const other of previous.tables) {
      const otherInfo = infoOf(other.table);
      const outgoing = info?.columns.find((column) => column.reference?.table.name === other.table && column.reference.table.databaseName === props.database);
      const incoming = otherInfo?.columns.find((column) => column.reference?.table.name === table && column.reference.table.databaseName === props.database);
      if (outgoing) {
        joins.push({id: uuidv4(), left: {alias: other.alias, column: outgoing.reference!.columnName}, right: {alias, column: outgoing.name}, kind: 'INNER'});
        break;
      }
      if (incoming) {
        joins.push({id: uuidv4(), left: {alias: other.alias, column: incoming.name}, right: {alias, column: incoming.reference!.columnName}, kind: 'INNER'});
        break;
      }
    }
    return {...previous, tables: [...previous.tables, box], joins};
  });

  const removeTable = (alias: string) => update((previous) => ({
    ...previous,
    tables: previous.tables.filter((table) => table.alias !== alias),
    joins: previous.joins.filter((join) => join.left.alias !== alias && join.right.alias !== alias),
    columns: previous.columns.filter((column) => column.alias !== alias),
  }));

  const toggleColumn = (alias: string, column: string) => update((previous) => {
    const existing = previous.columns.find((item) => item.alias === alias && item.column === column);
    return existing
      ? {...previous, columns: previous.columns.filter((item) => item.id !== existing.id)}
      : {...previous, columns: [...previous.columns, newColumn(alias, column)]};
  });

  const updateColumn = (id: string, values: Partial<QbColumnInterface>) => update((previous) => ({
    ...previous,
    columns: previous.columns.map((column) => column.id === id ? {...column, ...values} : column),
  }));

  const moveColumn = (index: number, by: number) => update((previous) => {
    const columns = [...previous.columns];
    const [moved] = columns.splice(index, 1);
    columns.splice(Math.max(0, Math.min(columns.length, index + by)), 0, moved);
    return {...previous, columns};
  });

  const setJoin = (id: string, values: Partial<QbJoinInterface> | null) => update((previous) => ({
    ...previous,
    joins: values === null ? previous.joins.filter((join) => join.id !== id) : previous.joins.map((join) => join.id === id ? {...join, ...values} : join),
  }));

  /** position of mouse in coordinates of canvas content */
  const point = (event: {clientX: number, clientY: number}) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {x: event.clientX - rect.left - pan.x, y: event.clientY - rect.top - pan.y};
  };

  const onMouseMove = (event: React.MouseEvent) => {
    if (!drag) return;
    if (drag.kind === 'pan') {
      setPan({x: drag.panX + event.clientX - drag.startX, y: drag.panY + event.clientY - drag.startY});
    } else if (drag.kind === 'box') {
      const x = Math.max(0, Math.round(drag.boxX + event.clientX - drag.startX));
      const y = Math.max(0, Math.round(drag.boxY + event.clientY - drag.startY));
      setState((previous) => ({...previous, tables: previous.tables.map((table) => table.alias === drag.alias ? {...table, x, y} : table)}));
    } else {
      setDrag({...drag, ...point(event)});
    }
  };

  const onMouseUp = () => {
    if (drag?.kind === 'box') {
      // position is saved after move
      update((previous) => previous);
    }
    setDrag(null);
  };

  /** column dropped on column of other table - new join */
  const onColumnMouseUp = (alias: string, column: string) => {
    if (drag?.kind !== 'link' || column === '*') return;
    if (drag.alias === alias) {
      setDrag(null);
      return;
    }
    const left = {alias: drag.alias, column: drag.column};
    update((previous) => ({...previous, joins: [...previous.joins, {id: uuidv4(), left, right: {alias, column}, kind: 'INNER'}]}));
    setDrag(null);
  };

  const rowY = (alias: string, column: string): number | null => {
    const table = state.tables.find((item) => item.alias === alias);
    if (!table) return null;
    const index = ['*', ...columnsOf(table.table)].indexOf(column);
    return table.y + HEADER + Math.max(0, index) * ROW + ROW / 2;
  };

  const joinPath = (join: QbJoinInterface): string | null => {
    const left = state.tables.find((table) => table.alias === join.left.alias);
    const right = state.tables.find((table) => table.alias === join.right.alias);
    const y1 = rowY(join.left.alias, join.left.column);
    const y2 = rowY(join.right.alias, join.right.column);
    if (!left || !right || y1 === null || y2 === null) return null;
    const leftOfRight = left.x + BOX_WIDTH / 2 < right.x + BOX_WIDTH / 2;
    const x1 = leftOfRight ? left.x + BOX_WIDTH : left.x;
    const x2 = leftOfRight ? right.x : right.x + BOX_WIDTH;
    const bend = Math.max(40, Math.abs(x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + (leftOfRight ? bend : -bend)} ${y1}, ${x2 + (leftOfRight ? -bend : bend)} ${y2}, ${x2} ${y2}`;
  };

  const joinMenu = (event: React.MouseEvent, join: QbJoinInterface) => {
    event.preventDefault();
    event.stopPropagation();
    const kinds: JoinKindType[] = ['INNER', 'LEFT', 'RIGHT'];
    setMenu({x: event.clientX, y: event.clientY, items: [
      ...kinds.map((kind): ContextMenuItem => ({label: `${kind} JOIN`, hint: join.kind === kind ? '✓' : undefined, onClick: () => setJoin(join.id, {kind})})),
      'separator',
      {label: 'Remove join', danger: true, onClick: () => setJoin(join.id, null)},
    ]});
  };

  const copySql = () => sql && navigator.clipboard?.writeText(`${sql};`).then(() => toast.success('SQL copied')).catch(() => toast.error('Unable to copy'));
  const fields = state.tables.flatMap((table) => ['*', ...columnsOf(table.table)].map((column) => ({alias: table.alias, column})));
  const shownTables = tables.filter((table) => !filter.trim() || table.tableName.toLowerCase().includes(filter.trim().toLowerCase()));
  const isSelected = (alias: string, column: string) => state.columns.some((item) => item.alias === alias && item.column === column);

  return (
    <div className="cmp-query-builder">
      <div className="qb-toolbar">
        <span className="qb-title"><FontAwesomeIcon icon={faWandMagicSparkles} /> Query builder · {props.database}</span>
        <label className="checkbox"><input type="checkbox" checked={state.distinct} onChange={(event) => update((previous) => ({...previous, distinct: event.target.checked}))} />DISTINCT</label>
        <label>LIMIT <input className="qb-limit" value={state.limit} onChange={(event) => update((previous) => ({...previous, limit: event.target.value.replace(/\D/g, '')}))} aria-label="Limit" /></label>
        <span className="qb-spacer" />
        <button type="button" className="primary" disabled={!sql} onClick={() => openConsole(props.connection, props.database, {sql: `${sql};`, autoRun: true, tabName: 'query builder'})} title="Execute in SQL console">
          <FontAwesomeIcon icon={faPlay} /> Run
        </button>
        <button type="button" disabled={!sql} onClick={() => openConsole(props.connection, props.database, {sql: `${sql};`, tabName: 'query builder'})} title="Open SQL in console without running">
          <FontAwesomeIcon icon={faTerminal} /> Open in console
        </button>
        <button type="button" disabled={!sql} onClick={copySql}><FontAwesomeIcon icon={faCopy} /> Copy SQL</button>
        <button type="button" disabled={!sql || !!connection.readOnly} onClick={() => setViewSelect(sql)}><FontAwesomeIcon icon={faEye} /> Create view…</button>
        <button type="button" disabled={!state.tables.length} onClick={() => update(() => EMPTY)} title="Remove all tables"><FontAwesomeIcon icon={faEraser} /> Clear</button>
      </div>

      <div className="qb-body">
        <aside className="qb-tables">
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter tables…" aria-label="Filter tables" />
          <ul>
            {shownTables.map((table) => (
              <li key={table.tableName}>
                <button
                  type="button"
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData('text/flase-table', table.tableName)}
                  onClick={() => addTable(table.tableName)}
                  title="Click or drag to canvas to add table"
                >
                  <FontAwesomeIcon icon={faPlus} /> {table.tableName}
                </button>
              </li>
            ))}
            {!tables.length && <li className="qb-muted">Loading tables…</li>}
          </ul>
        </aside>

        <div className="qb-main">
          <div
            ref={canvasRef}
            className={`qb-canvas ${drag?.kind === 'link' ? 'linking' : ''}`}
            onMouseDown={(event) => event.button === 0 && setDrag({kind: 'pan', startX: event.clientX, startY: event.clientY, panX: pan.x, panY: pan.y})}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              const table = event.dataTransfer.getData('text/flase-table');
              if (table) {
                const at = point(event);
                addTable(table, {x: Math.max(0, Math.round(at.x - 40)), y: Math.max(0, Math.round(at.y - 10))});
              }
            }}
          >
            {!state.tables.length && <div className="qb-empty">Click or drag tables from the list. Joins follow foreign keys; drag ● of a column to a column of other table for own join.</div>}
            <div className="qb-content" style={{transform: `translate(${pan.x}px, ${pan.y}px)`}}>
              <svg className="qb-joins">
                {state.joins.map((join) => {
                  const path = joinPath(join);
                  return path && (
                    <g key={join.id} onContextMenu={(event) => joinMenu(event, join)} onClick={(event) => joinMenu(event, join)}>
                      <path d={path} className={`qb-join ${join.kind.toLowerCase()}`} />
                      <path d={path} className="qb-join-hit" data-join={`${join.left.alias}.${join.left.column}=${join.right.alias}.${join.right.column}`}>
                        <title>{`${join.kind} JOIN ${join.left.alias}.${join.left.column} = ${join.right.alias}.${join.right.column}`}</title>
                      </path>
                    </g>
                  );
                })}
                {drag?.kind === 'link' && (() => {
                  const table = state.tables.find((item) => item.alias === drag.alias);
                  const y = rowY(drag.alias, drag.column);
                  return table && y !== null && <line x1={table.x + BOX_WIDTH} y1={y} x2={drag.x} y2={drag.y} className="qb-join linking" />;
                })()}
              </svg>
              {state.tables.map((table) => (
                <div key={table.alias} className="qb-box" style={{left: table.x, top: table.y, width: BOX_WIDTH}} data-alias={table.alias}>
                  <div
                    className="qb-box-header"
                    onMouseDown={(event) => {
                      if (event.button !== 0) return;
                      event.stopPropagation();
                      setDrag({kind: 'box', alias: table.alias, startX: event.clientX, startY: event.clientY, boxX: table.x, boxY: table.y});
                    }}
                    title={table.alias === table.table ? table.table : `${table.table} AS ${table.alias}`}
                  >
                    <span>{table.alias}{table.alias !== table.table && <small> {table.table}</small>}</span>
                    <button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={() => removeTable(table.alias)} aria-label={`Remove ${table.alias}`}><FontAwesomeIcon icon={faXmark} /></button>
                  </div>
                  {['*', ...columnsOf(table.table)].map((column) => {
                    const info = infoOf(table.table)?.columns.find((item) => item.name === column);
                    return (
                      <div
                        key={column}
                        className={`qb-box-row ${isSelected(table.alias, column) ? 'selected' : ''}`}
                        onMouseDown={(event) => event.stopPropagation()}
                        onMouseUp={() => onColumnMouseUp(table.alias, column)}
                        data-column={`${table.alias}.${column}`}
                      >
                        <label>
                          <input type="checkbox" checked={isSelected(table.alias, column)} onChange={() => toggleColumn(table.alias, column)} aria-label={`${table.alias}.${column}`} />
                          <span className={info?.primaryKey ? 'pk' : info?.reference ? 'fk' : ''}>{column === '*' ? '* all columns' : column}</span>
                        </label>
                        {info && <span className="qb-type">{info.type}</span>}
                        {column !== '*' && (
                          <span
                            className="qb-handle"
                            title="Drag to column of other table to join"
                            onMouseDown={(event) => {
                              event.stopPropagation();
                              event.preventDefault();
                              setDrag({kind: 'link', alias: table.alias, column, ...point(event)});
                            }}
                          >●</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="qb-bottom">
            <div className="qb-grid">
              <table>
                <thead>
                  <tr><th>Column</th><th>Alias</th><th>Show</th><th>Aggregate</th><th>Sort</th><th>Filter</th><th>Value</th><th /></tr>
                </thead>
                <tbody>
                  {state.columns.map((column, index) => (
                    <tr key={column.id}>
                      <td>
                        <select
                          value={`${column.alias}.${column.column}`}
                          onChange={(event) => {
                            const field = fields.find((item) => `${item.alias}.${item.column}` === event.target.value);
                            if (field) updateColumn(column.id, {alias: field.alias, column: field.column});
                          }}
                          aria-label={`Column ${index + 1}`}
                        >
                          {fields.map((field) => <option key={`${field.alias}.${field.column}`} value={`${field.alias}.${field.column}`}>{field.alias}.{field.column}</option>)}
                        </select>
                      </td>
                      <td><input value={column.as} onChange={(event) => updateColumn(column.id, {as: event.target.value})} aria-label={`Alias ${index + 1}`} /></td>
                      <td className="center"><input type="checkbox" checked={column.show} onChange={(event) => updateColumn(column.id, {show: event.target.checked})} aria-label={`Show ${index + 1}`} /></td>
                      <td>
                        <select value={column.aggregate} onChange={(event) => updateColumn(column.id, {aggregate: event.target.value as QbColumnInterface['aggregate']})} aria-label={`Aggregate ${index + 1}`}>
                          <option value="">—</option>
                          {AGGREGATES.map((item) => <option key={item}>{item}</option>)}
                        </select>
                      </td>
                      <td>
                        <select value={column.sort} onChange={(event) => updateColumn(column.id, {sort: event.target.value as QbColumnInterface['sort']})} aria-label={`Sort ${index + 1}`}>
                          <option value="">—</option>
                          <option>ASC</option>
                          <option>DESC</option>
                        </select>
                      </td>
                      <td>
                        <select value={column.operator} onChange={(event) => updateColumn(column.id, {operator: event.target.value as QbColumnInterface['operator']})} aria-label={`Filter ${index + 1}`}>
                          <option value="">—</option>
                          {OPERATORS.map((item) => <option key={item}>{item}</option>)}
                        </select>
                      </td>
                      <td>
                        <input
                          value={column.value}
                          disabled={!column.operator || column.operator.startsWith('IS ')}
                          placeholder={column.operator.endsWith('IN') ? 'a, b, c' : ''}
                          onChange={(event) => updateColumn(column.id, {value: event.target.value})}
                          aria-label={`Value ${index + 1}`}
                        />
                      </td>
                      <td className="qb-actions">
                        <button type="button" onClick={() => moveColumn(index, -1)} disabled={index === 0} title="Move up"><FontAwesomeIcon icon={faArrowUp} /></button>
                        <button type="button" onClick={() => moveColumn(index, 1)} disabled={index === state.columns.length - 1} title="Move down"><FontAwesomeIcon icon={faArrowDown} /></button>
                        <button type="button" onClick={() => update((previous) => ({...previous, columns: previous.columns.filter((item) => item.id !== column.id)}))} title="Remove"><FontAwesomeIcon icon={faXmark} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!state.columns.length && <div className="qb-muted qb-hint">Check columns in tables - without columns all are selected (SELECT *). A column can be added more times, e.g. to filter it twice.</div>}
              {state.tables.length > 0 && fields.length > 0 && (
                <button type="button" className="qb-add" onClick={() => update((previous) => ({...previous, columns: [...previous.columns, newColumn(fields[1]?.alias || fields[0].alias, fields[1]?.column || '*')]}))}>
                  <FontAwesomeIcon icon={faPlus} /> Add column
                </button>
              )}
            </div>
            <div className="qb-sql">
              {sql
                ? <SyntaxHighlighter language="sql" style={theme === 'light' ? prism : darcula} customStyle={{margin: 0, padding: '10px 12px', background: 'transparent', fontSize: '0.85rem'}}>{`${sql};`}</SyntaxHighlighter>
                : <div className="qb-muted qb-hint">SQL is shown here.</div>}
            </div>
          </div>
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {viewSelect && <CreateViewPopup database={props.database} select={viewSelect} busy={view.busy} onPreview={view.run} onCancel={() => setViewSelect(null)} />}
      {view.element}
    </div>
  );
};

export default QueryBuilder;
