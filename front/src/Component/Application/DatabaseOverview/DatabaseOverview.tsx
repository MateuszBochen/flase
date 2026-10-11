import React, {MouseEvent, useCallback, useEffect, useMemo, useState} from 'react';
import toast from 'react-hot-toast';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {
  faArrowsRotate,
  faDatabase,
  faEllipsis,
  faPlus,
  faRightLeft,
  faTableCells,
  faTerminal,
  faTrashCan,
  faEraser,
  faScrewdriverWrench,
  faWandMagicSparkles,
} from '@fortawesome/free-solid-svg-icons';
import ApplicationInterface from '../ApplicationInterface';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import useConnectionSettings from '../../../Library/Connection/useConnectionSettings';
import EventBus from '../../../Library/EventBus/EventBus';
import WebsocketReceivedAMessage from '../../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../../Library/WebSocket/Interface/MessageInterface';
import MessageType from '../../../Library/WebSocket/Enum/MessageType';
import DriverFactory from '../../../Library/Database/Driver/DriverFactory';
import DatabaseOperations from '../../../Library/Database/DatabaseOperations';
import DatabaseManger from '../../../Library/Database/DatabaseManger';
import TableManager from '../../../Library/Table/TableManager';
import {formatBytes} from '../../../Library/Record/BinaryValue';
import {
  DatabaseObjectsInterface,
  DatabaseRoutineInterface,
  DatabaseTableItemInterface,
  ObjectRefInterface,
} from '../../../Library/Database/Interface/DatabaseObjectsInterface';
import {DatabaseOperationType, MaintenanceActionType} from '../../../Library/Database/Interface/DatabaseOperationInterface';
import TableInterface from '../../../Library/Table/Interface/TableInterface';
import ContextMenu, {ContextMenuItem} from '../../../UI/ContextMenu/ContextMenu';
import NewTabComponentWasSelected from '../../ApplicationRenderer/Event/NewTabComponentWasSelected';
import CurrentTabComponentWasSelected from '../../ApplicationRenderer/Event/CurrentTabComponentWasSelected';
import openTableTab from '../TableRecords/openTableTab';
import useStructureChange from '../TableRecords/Structure/useStructureChange';
import SqlConfirmPopup from '../TableRecords/Structure/SqlConfirmPopup';
import TableNameForm from '../TableRecords/Structure/TableNameForm';
import useDatabaseOperation from '../../DatabaseOperations/useDatabaseOperation';
import DatabaseFormPopup, {DatabaseFormModeType} from '../../DatabaseOperations/DatabaseFormPopup';
import ObjectEditorPopup from '../../DatabaseOperations/ObjectEditorPopup';
import ExecuteRoutinePopup from '../../DatabaseOperations/ExecuteRoutinePopup';
import {maintenanceActions} from '../../DatabaseOperations/MaintenanceResultsPopup';
import {ObjectTypeType, OBJECT_LABELS} from '../../DatabaseOperations/objectTemplates';
import openConsole from '../../DatabaseOperations/openConsole';
import TransferTab, {TransferTabPropsInterface} from '../Transfer/TransferTab';
import CreateTable, {CreateTablePropsInterface} from '../CreateTable/CreateTable';
import QueryBuilder, {QueryBuilderPropsInterface} from '../QueryBuilder/QueryBuilder';
import '../TableRecords/Structure/style.css';
import './style.css';

export interface DatabaseOverviewPropsInterface extends ApplicationInterface {
  connection: ConnectionDataInterface;
  database: string;
}

type MenuState =
  | {x: number, y: number, kind: 'table', table: DatabaseTableItemInterface}
  | {x: number, y: number, kind: 'routine', routine: DatabaseRoutineInterface}
  | {x: number, y: number, kind: 'object', object: ObjectRefInterface}
  | {x: number, y: number, kind: 'new' | 'more'}
  | null;

type EditorState = {object: ObjectRefInterface | null, type: ObjectTypeType} | null;

const size = (bytes: number | null) => bytes === null ? '' : formatBytes(bytes);

const copyName = (name: string): ContextMenuItem => ({
  label: 'Copy name',
  onClick: () => navigator.clipboard?.writeText(name).then(() => toast.success('Copied')),
});

/** "(IN a int, OUT b int)" */
const parametersText = (routine: DatabaseRoutineInterface) => routine.parameters
  .map((parameter) => `${parameter.mode !== 'IN' ? `${parameter.mode} ` : ''}${parameter.name ? `${parameter.name} ` : ''}${parameter.type}`)
  .join(', ');

/** DatabaseOverview - tables with sizes and operations on selected tables, views, routines, triggers and events of database */
const DatabaseOverview = (props: DatabaseOverviewPropsInterface) => {
  const connection = useConnectionSettings(props.connection);
  const driver = DriverFactory.getDriver(props.connection);
  const isMysql = driver.dialect === 'mysql';
  const label = driver.features.databaseLabel;
  const readOnly = !!connection.readOnly;
  const tabId = props.tabId || `overview:${props.database}`;
  const objectsTabId = `${tabId}:objects`;

  const [objects, setObjects] = useState<DatabaseObjectsInterface | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string>('');
  const [menu, setMenu] = useState<MenuState>(null);
  const [databaseForm, setDatabaseForm] = useState<DatabaseFormModeType | null>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [executing, setExecuting] = useState<DatabaseRoutineInterface | null>(null);
  /** table of rename / copy */
  const [nameForm, setNameForm] = useState<{mode: 'rename' | 'copy', table: string} | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    DatabaseOperations.objects(props.connection, props.database, objectsTabId);
  }, [props.connection, props.database, objectsTabId]);

  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.payload?.tabId !== objectsTabId) return;
      if (message.message === MessageType.DATABASE_OBJECTS) {
        const received = message.payload as DatabaseObjectsInterface;
        setObjects(received);
        // selection keeps only existing tables
        setSelected((previous) => new Set(Array.from(previous).filter((name) => received.tables.some((table) => table.name === name))));
        setLoading(false);
      } else if (message.message === MessageType.QUERY_ERROR) {
        setError(message.payload.error);
        setLoading(false);
      }
    });
    load();
    return () => EventBus.unSub(eventId);
  }, [objectsTabId, load]);

  const reloadTables = () => TableManager.getInstance().askForTableList(props.connection, {name: props.database}, true);

  const operation = useDatabaseOperation(props.connection, `${tabId}:operation`, (applied: DatabaseOperationType) => {
    setDatabaseForm(null);
    setEditor(null);
    switch (applied.kind) {
      case 'dropDatabase':
        DatabaseManger.getInstance().reloadDatabaseList(props.connection);
        setGone(`${label} ${props.database} was dropped.`);
        return;
      case 'renameDatabase':
        DatabaseManger.getInstance().reloadDatabaseList(props.connection);
        // overview of new name replaces this one
        EventBus.emit(new CurrentTabComponentWasSelected<DatabaseOverviewPropsInterface>(overviewTab(props.connection, applied.newName)));
        return;
      case 'maintenance':
        load();
        return;
      default:
        load();
        reloadTables();
    }
  });

  const tableChange = useStructureChange(
    props.connection,
    {databaseName: props.database, name: nameForm?.table || ''},
    `${tabId}:table`,
    (applied) => {
      setNameForm(null);
      load();
      reloadTables();
      if (applied.kind === 'copy' || applied.kind === 'rename') {
        openTableTab(props.connection, {databaseName: props.database, name: applied.newName}, {newTab: true});
      }
    },
  );

  const tables = objects?.tables || [];
  const shownTables = useMemo(() => {
    const terms = filter.toLowerCase().split(',').map((term) => term.trim()).filter(Boolean);
    return terms.length ? tables.filter((table) => terms.some((term) => table.name.toLowerCase().includes(term))) : tables;
  }, [tables, filter]);
  const chosen = tables.filter((table) => selected.has(table.name)).map((table) => table.name);
  const allShownSelected = shownTables.length > 0 && shownTables.every((table) => selected.has(table.name));

  const toggle = (name: string) => setSelected((previous) => {
    const next = new Set(previous);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });
  const toggleAll = () => setSelected((previous) => {
    const next = new Set(previous);
    shownTables.forEach((table) => allShownSelected ? next.delete(table.name) : next.add(table.name));
    return next;
  });

  const run = (op: DatabaseOperationType) => operation.run(op);
  const tablesAction = (action: 'truncate' | 'drop', names: string[]) => run({kind: 'tables', action, database: props.database, tables: names, ignoreForeignKeys: false});
  const maintenance = (action: string, names: string[]) => run({kind: 'maintenance', action: action as MaintenanceActionType, database: props.database, tables: names});

  const openTransfer = (names: string[]) => EventBus.emit(new NewTabComponentWasSelected<TransferTabPropsInterface>({
    component: TransferTab,
    props: {connection: props.connection, database: props.database, tables: names},
    tabName: `Import / export: ${props.database}`,
    isActive: false,
    activate: true,
  }));

  const openCreateTable = () => EventBus.emit(new NewTabComponentWasSelected<CreateTablePropsInterface>(createTableTab(props.connection, props.database)));

  const openMenu = (event: MouseEvent, state: NonNullable<MenuState>) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu(state);
  };

  const newObjectItems = (): ContextMenuItem[] => (['VIEW', 'PROCEDURE', 'FUNCTION', 'TRIGGER', ...(objects?.events ? ['EVENT'] : [])] as ObjectTypeType[])
    .map((type) => ({label: `New ${OBJECT_LABELS[type]}…`, disabled: readOnly, onClick: () => setEditor({object: null, type})}));

  const menuItems = (state: NonNullable<MenuState>): ContextMenuItem[] => {
    switch (state.kind) {
      case 'new':
        return [{label: 'New table…', disabled: readOnly, onClick: openCreateTable}, 'separator', ...newObjectItems()];
      case 'more':
        return [
          ...(isMysql ? [{label: 'Change collation…', disabled: readOnly, onClick: () => setDatabaseForm('collation')} as ContextMenuItem] : []),
          {label: `Rename ${label.toLowerCase()}…`, disabled: readOnly, onClick: () => setDatabaseForm('rename')},
          'separator',
          {label: `Drop ${label.toLowerCase()}…`, danger: true, disabled: readOnly, onClick: () => run({kind: 'dropDatabase', name: props.database})},
          'separator',
          copyName(props.database),
        ];
      case 'table': {
        const table = state.table;
        return [
          {label: 'Open', onClick: () => openTableTab(props.connection, {databaseName: props.database, name: table.name}, {newTab: false})},
          {label: 'Open in new tab', onClick: () => openTableTab(props.connection, {databaseName: props.database, name: table.name}, {newTab: true})},
          ...(table.isView ? [{label: 'Edit view…', disabled: readOnly, onClick: () => setEditor({object: {type: 'VIEW', name: table.name}, type: 'VIEW'})} as ContextMenuItem] : []),
          'separator',
          {label: 'Rename…', disabled: readOnly, onClick: () => setNameForm({mode: 'rename', table: table.name})},
          {label: 'Copy…', disabled: readOnly || table.isView, onClick: () => setNameForm({mode: 'copy', table: table.name})},
          {label: 'Truncate…', danger: true, disabled: readOnly || table.isView, onClick: () => tablesAction('truncate', [table.name])},
          {label: 'Drop…', danger: true, disabled: readOnly, onClick: () => tablesAction('drop', [table.name])},
          'separator',
          {
            label: 'Maintenance',
            disabled: readOnly || table.isView,
            children: maintenanceActions(driver.dialect).map((item) => ({label: item.label, hint: item.hint.split(' - ')[0], onClick: () => maintenance(item.action, [table.name])})),
          },
          {label: 'Export…', onClick: () => openTransfer([table.name])},
          copyName(table.name),
        ];
      }
      case 'routine': {
        const routine = state.routine;
        const object: ObjectRefInterface = {type: routine.kind, name: routine.name, signature: routine.signature};
        return [
          {label: 'Execute…', disabled: readOnly && routine.kind === 'PROCEDURE', onClick: () => setExecuting(routine)},
          {label: 'Edit…', disabled: readOnly, onClick: () => setEditor({object, type: routine.kind})},
          'separator',
          {label: 'Drop…', danger: true, disabled: readOnly, onClick: () => run({kind: 'dropObject', database: props.database, object})},
          'separator',
          copyName(routine.name),
        ];
      }
      case 'object':
        return [
          {label: 'Edit…', disabled: readOnly, onClick: () => setEditor({object: state.object, type: state.object.type})},
          'separator',
          {label: 'Drop…', danger: true, disabled: readOnly, onClick: () => run({kind: 'dropObject', database: props.database, object: state.object})},
          'separator',
          copyName(state.object.name),
        ];
    }
  };

  const totals = tables.reduce((sum, table) => ({
    rows: sum.rows + (table.rows || 0),
    data: sum.data + (table.dataLength || 0),
    index: sum.index + (table.indexLength || 0),
  }), {rows: 0, data: 0, index: 0});

  const sectionAction = (text: string, onClick: () => void) => !readOnly && (
    <button type="button" className="structure-section-action" onClick={onClick}>{text}</button>
  );

  return (
    <div className="cmp-database-overview cmp-structure-view">
      <div className="overview-toolbar">
        <span className="overview-title"><FontAwesomeIcon icon={faDatabase} /> {props.database}</span>
        {objects?.collation && <span className="overview-chip" title="Default collation">{objects.collation}</span>}
        <span className="overview-spacer" />
        <button type="button" onClick={openCreateTable} disabled={readOnly || !!gone} title="Create table (Structure → new table)">
          <FontAwesomeIcon icon={faPlus} /> New table
        </button>
        <button type="button" onClick={(event) => openMenu(event, {x: event.clientX, y: event.clientY, kind: 'new'})} disabled={!!gone} title="New view, procedure, function, trigger or event">
          <FontAwesomeIcon icon={faPlus} /> New…
        </button>
        <button type="button" onClick={() => openConsole(props.connection, props.database)} disabled={!!gone} title={`SQL console for ${props.database}`}>
          <FontAwesomeIcon icon={faTerminal} /> Console
        </button>
        <button
          type="button"
          disabled={!!gone}
          title="Visual query builder"
          onClick={() => EventBus.emit(new NewTabComponentWasSelected<QueryBuilderPropsInterface>({
            component: QueryBuilder,
            props: {connection: props.connection, database: props.database},
            tabName: `Query builder: ${props.database}`,
            isActive: false,
            activate: true,
          }))}
        >
          <FontAwesomeIcon icon={faWandMagicSparkles} /> Query builder
        </button>
        <button type="button" onClick={() => openTransfer(chosen)} disabled={!!gone} title="Import / export">
          <FontAwesomeIcon icon={faRightLeft} /> Import / export
        </button>
        <button type="button" onClick={load} disabled={loading || !!gone} title="Reload">
          <FontAwesomeIcon icon={faArrowsRotate} spin={loading} />
        </button>
        <button
          type="button"
          aria-label={`${label} operations`}
          onClick={(event) => openMenu(event, {x: event.clientX, y: event.clientY, kind: 'more'})}
          disabled={!!gone}
          title={`Collation, rename, drop of ${label.toLowerCase()}`}
        >
          <FontAwesomeIcon icon={faEllipsis} />
        </button>
      </div>

      {gone && <div className="structure-gone">{gone}</div>}
      {error && !gone && <div className="structure-error">{error}</div>}
      {loading && !objects && <div className="structure-loading">Loading…</div>}

      {objects && !gone && (
        <div className="structure-content">
          {objects.warnings.length > 0 && <div className="structure-warning">{objects.warnings.map((warning) => <div key={warning}>{warning}</div>)}</div>}

          <section className="structure-section">
            <h3>
              Tables and views<span className="structure-count">{tables.length}</span>
              {sectionAction('+ New table', openCreateTable)}
              {sectionAction('+ New view', () => setEditor({object: null, type: 'VIEW'}))}
            </h3>
            <div className="overview-selection">
              <input className="overview-filter" value={filter} placeholder="Filter tables…" onChange={(event) => setFilter(event.target.value)} aria-label="Filter tables" />
              <span className="overview-selected">{chosen.length ? `${chosen.length} selected` : 'Select tables for operations'}</span>
              <button type="button" disabled={!chosen.length} onClick={() => openTransfer(chosen)} title="Export selected tables">
                <FontAwesomeIcon icon={faRightLeft} /> Export
              </button>
              <button type="button" className="danger" disabled={!chosen.length || readOnly} onClick={() => tablesAction('truncate', chosen)} title="Delete all rows of selected tables">
                <FontAwesomeIcon icon={faEraser} /> Truncate
              </button>
              <button type="button" className="danger" disabled={!chosen.length || readOnly} onClick={() => tablesAction('drop', chosen)} title="Drop selected tables and views">
                <FontAwesomeIcon icon={faTrashCan} /> Drop
              </button>
              <span className="overview-separator" />
              <FontAwesomeIcon icon={faScrewdriverWrench} className="overview-muted" title="Maintenance" />
              {maintenanceActions(driver.dialect).map((item) => (
                <button key={item.action} type="button" disabled={!chosen.length || readOnly} onClick={() => maintenance(item.action, chosen)} title={item.hint}>
                  {item.label}
                </button>
              ))}
            </div>
            {tables.length === 0 ? <div className="structure-empty">No tables</div> : (
              <table className="structure-table overview-tables">
                <thead>
                  <tr>
                    <th><input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label="Select all tables" /></th>
                    <th>Name</th><th>Type</th><th className="number">Rows</th><th className="number">Data</th><th className="number">Indexes</th>
                    <th>{isMysql ? 'Engine' : 'Access method'}</th>{isMysql && <th>Collation</th>}<th>Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {shownTables.map((table) => (
                    <tr
                      key={table.name}
                      className={`structure-row ${selected.has(table.name) ? 'selected' : ''}`}
                      onContextMenu={(event) => openMenu(event, {x: event.clientX, y: event.clientY, kind: 'table', table})}
                      onClick={(event) => {
                        if ((event.target as HTMLElement).closest('button, input')) return;
                        toggle(table.name);
                      }}
                      onDoubleClick={() => openTableTab(props.connection, {databaseName: props.database, name: table.name}, {newTab: false})}
                    >
                      <td><input type="checkbox" checked={selected.has(table.name)} onChange={() => toggle(table.name)} aria-label={`Select ${table.name}`} /></td>
                      <td className="name">
                        <button type="button" className="structure-link" onClick={() => openTableTab(props.connection, {databaseName: props.database, name: table.name}, {newTab: false})} title="Open table">
                          {table.name}
                        </button>
                      </td>
                      <td className="muted">{table.isView ? table.type.toLowerCase() : table.type === 'BASE TABLE' ? 'table' : table.type.toLowerCase()}</td>
                      <td className="number">{table.rows === null ? '' : `~${table.rows.toLocaleString()}`}</td>
                      <td className="number">{size(table.dataLength)}</td>
                      <td className="number">{size(table.indexLength)}</td>
                      <td className="muted">{table.engine}</td>
                      {isMysql && <td className="muted">{table.collation}</td>}
                      <td>{table.comment}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td />
                    <td className="muted">{tables.length} object(s)</td>
                    <td />
                    <td className="number muted">~{totals.rows.toLocaleString()}</td>
                    <td className="number muted">{formatBytes(totals.data)}</td>
                    <td className="number muted">{formatBytes(totals.index)}</td>
                    <td colSpan={isMysql ? 3 : 2} />
                  </tr>
                </tfoot>
              </table>
            )}
          </section>

          <section className="structure-section">
            <h3>
              Procedures and functions<span className="structure-count">{objects.routines.length}</span>
              {sectionAction('+ New procedure', () => setEditor({object: null, type: 'PROCEDURE'}))}
              {sectionAction('+ New function', () => setEditor({object: null, type: 'FUNCTION'}))}
            </h3>
            {!objects.routines.length ? <div className="structure-empty">None</div> : (
              <table className="structure-table">
                <thead><tr><th>Name</th><th>Type</th><th>Parameters</th><th>Returns</th><th>Language</th><th>Comment</th></tr></thead>
                <tbody>
                  {objects.routines.map((routine) => (
                    <tr
                      key={`${routine.kind}:${routine.name}(${routine.signature})`}
                      className="structure-row"
                      onContextMenu={(event) => openMenu(event, {x: event.clientX, y: event.clientY, kind: 'routine', routine})}
                      onDoubleClick={() => !readOnly && setEditor({object: {type: routine.kind, name: routine.name, signature: routine.signature}, type: routine.kind})}
                    >
                      <td className="name">{routine.name}</td>
                      <td className="muted">{routine.kind.toLowerCase()}</td>
                      <td className="type">{parametersText(routine)}</td>
                      <td className="type">{routine.returns}</td>
                      <td className="muted">{routine.language}</td>
                      <td>{routine.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="structure-section">
            <h3>
              Triggers<span className="structure-count">{objects.triggers.length}</span>
              {sectionAction('+ New trigger', () => setEditor({object: null, type: 'TRIGGER'}))}
            </h3>
            {!objects.triggers.length ? <div className="structure-empty">None</div> : (
              <table className="structure-table">
                <thead><tr><th>Name</th><th>Table</th><th>Timing</th><th>Event</th></tr></thead>
                <tbody>
                  {objects.triggers.map((trigger) => {
                    const object: ObjectRefInterface = {type: 'TRIGGER', name: trigger.name, table: trigger.table};
                    return (
                      <tr
                        key={`${trigger.table}.${trigger.name}`}
                        className="structure-row"
                        onContextMenu={(event) => openMenu(event, {x: event.clientX, y: event.clientY, kind: 'object', object})}
                        onDoubleClick={() => !readOnly && setEditor({object, type: 'TRIGGER'})}
                      >
                        <td className="name">{trigger.name}</td>
                        <td>
                          <button type="button" className="structure-link" onClick={() => openTableTab(props.connection, {databaseName: props.database, name: trigger.table}, {newTab: true})}>{trigger.table}</button>
                        </td>
                        <td>{trigger.timing}</td>
                        <td>{trigger.event}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {objects.events && (
            <section className="structure-section">
              <h3>
                Events<span className="structure-count">{objects.events.length}</span>
                {sectionAction('+ New event', () => setEditor({object: null, type: 'EVENT'}))}
              </h3>
              {objects.eventScheduler && !/^(ON|1)$/i.test(objects.eventScheduler) && objects.events.length > 0 && (
                <div className="structure-warning">Event scheduler is {objects.eventScheduler} - events do not run (SET GLOBAL event_scheduler = ON).</div>
              )}
              {!objects.events.length ? <div className="structure-empty">None</div> : (
                <table className="structure-table">
                  <thead><tr><th>Name</th><th>Status</th><th>Schedule</th><th>Last executed</th><th>Comment</th></tr></thead>
                  <tbody>
                    {objects.events.map((item) => {
                      const object: ObjectRefInterface = {type: 'EVENT', name: item.name};
                      return (
                        <tr
                          key={item.name}
                          className="structure-row"
                          onContextMenu={(event) => openMenu(event, {x: event.clientX, y: event.clientY, kind: 'object', object})}
                          onDoubleClick={() => !readOnly && setEditor({object, type: 'EVENT'})}
                        >
                          <td className="name">{item.name}</td>
                          <td className={item.status === 'ENABLED' ? '' : 'muted'}>{item.status}</td>
                          <td>{item.schedule}</td>
                          <td className="muted">{item.lastExecuted}</td>
                          <td>{item.comment}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          )}
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu)} onClose={() => setMenu(null)} />}

      {databaseForm && (
        <DatabaseFormPopup
          connection={props.connection}
          mode={databaseForm}
          database={props.database}
          collation={objects?.collation}
          busy={operation.busy}
          onPreview={run}
          onCancel={() => setDatabaseForm(null)}
        />
      )}

      {editor && (
        <ObjectEditorPopup
          connection={props.connection}
          database={props.database}
          object={editor.object}
          type={editor.type}
          table={tables.find((table) => !table.isView)?.name}
          tabId={tabId}
          busy={operation.busy}
          onPreview={run}
          onCancel={() => setEditor(null)}
        />
      )}

      {executing && (
        <ExecuteRoutinePopup
          connection={props.connection}
          database={props.database}
          routine={executing}
          onCancel={() => setExecuting(null)}
          onExecute={(statements) => {
            setExecuting(null);
            openConsole(props.connection, props.database, {sql: statements.map((statement) => `${statement};`).join('\n'), autoRun: true, tabName: `${executing.name}()`});
          }}
        />
      )}

      {nameForm && (
        <TableNameForm
          mode={nameForm.mode}
          currentName={nameForm.table}
          busy={tableChange.busy}
          onCancel={() => setNameForm(null)}
          onPreview={(newName, withData) => tableChange.requestPreview(nameForm.mode === 'copy' ? {kind: 'copy', newName, withData} : {kind: 'rename', newName})}
        />
      )}
      {tableChange.preview && (
        <SqlConfirmPopup
          statements={tableChange.preview.statements}
          change={tableChange.preview.change}
          busy={tableChange.busy}
          onExecute={tableChange.execute}
          onCancel={tableChange.closePreview}
        />
      )}

      {operation.element}
    </div>
  );
};

/** tab of overview - from sidebar, overview after rename */
export const overviewTab = (connection: ConnectionDataInterface, database: string) => ({
  component: DatabaseOverview,
  props: {connection, database},
  tabName: `${database}: overview`,
  isActive: false,
  activate: true,
});

/** tab of create table form */
export const createTableTab = (connection: ConnectionDataInterface, database: string) => ({
  component: CreateTable,
  props: {connection, database},
  tabName: `${database}: new table`,
  isActive: false,
  activate: true,
});

export default DatabaseOverview;
