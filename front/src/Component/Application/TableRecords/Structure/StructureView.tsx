import DriverFactory from '../../../../Library/Database/Driver/DriverFactory';
import React, {forwardRef, MouseEvent, useCallback, useEffect, useImperativeHandle, useState} from 'react';
import {Prism as SyntaxHighlighter} from 'react-syntax-highlighter';
import {darcula, prism} from 'react-syntax-highlighter/dist/esm/styles/prism';
import {useTheme} from '../../../../Library/Theme/ThemeManager';
import toast from 'react-hot-toast';
import EventBus from '../../../../Library/EventBus/EventBus';
import WebsocketReceivedAMessage from '../../../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../../../Library/WebSocket/Interface/MessageInterface';
import MessageType from '../../../../Library/WebSocket/Enum/MessageType';
import TableManager from '../../../../Library/Table/TableManager';
import TableStructureInterface, {
  StructureColumnInterface,
  StructureForeignKeyInterface,
} from '../../../../Library/Table/Interface/TableStructureInterface';
import QueryErrorInterface from '../../../../Library/Record/Interface/QueryErrorInterface';
import ConnectionDataInterface from '../../../../Library/Connection/Interface/ConnectionDataInterface';
import TableInterface from '../../../../Library/Table/Interface/TableInterface';
import {StructureChangeType} from '../../../../Library/Table/Interface/StructureChangeInterface';
import ContextMenu, {ContextMenuItem} from '../../../../UI/ContextMenu/ContextMenu';
import QueryRefreshWasRequested from '../Event/QueryRefreshWasRequested';
import ColumnForm from './ColumnForm';
import IndexForm from './IndexForm';
import useStructureChange from './useStructureChange';
import SqlConfirmPopup from './SqlConfirmPopup';
import './style.css';
import useConnectionSettings from '../../../../Library/Connection/useConnectionSettings';

interface StructureViewPropsInterface {
  connection: ConnectionDataInterface;
  table: TableInterface;
  /** own id for websocket answers, different from data grid of the same tab */
  structureTabId: string;
  /** data grid of the same tab - reloaded after structure change */
  dataTabId: string;
  /** structure is loaded when view is shown first time */
  visible: boolean;
  /** table was renamed or dropped - no more changes */
  gone: string | null;
  onOpenTable: (table: TableInterface) => void;
}

export interface StructureViewRefInterface {
  reload: () => void;
}

type FormState =
  | {type: 'column', column?: StructureColumnInterface, after?: string}
  | {type: 'index'}
  | null;

type MenuState = {x: number, y: number, kind: 'column' | 'index', name: string} | null;


const formatBytes = (bytes: number | null): string => {
  if (bytes === null) return '-';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
};

const TableLink = (props: {table: TableInterface, current: TableInterface, onOpen: (table: TableInterface) => void}) => {
  const sameDatabase = props.table.databaseName === props.current.databaseName;
  return (
    <button type="button" className="structure-link" onClick={() => props.onOpen(props.table)} title="Open table">
      {sameDatabase ? props.table.name : `${props.table.databaseName}.${props.table.name}`}
    </button>
  );
};

const Section = (props: {title: string, count?: number, action?: React.ReactNode, children: React.ReactNode, empty?: boolean}) => (
  <section className="structure-section">
    <h3>
      {props.title}
      {props.count !== undefined && <span className="structure-count">{props.count}</span>}
      {props.action}
    </h3>
    {props.empty ? <div className="structure-empty">None</div> : props.children}
  </section>
);

/** StructureView - columns, indexes, keys, triggers and DDL of table, column / index changes with sql preview */
export default forwardRef<StructureViewRefInterface, StructureViewPropsInterface>((props, ref) => {
  const connection = useConnectionSettings(props.connection);
  const theme = useTheme();
  const [structure, setStructure] = useState<TableStructureInterface | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<boolean>(false);

  const [form, setForm] = useState<FormState>(null);
  const [menu, setMenu] = useState<MenuState>(null);

  const tableManager = TableManager.getInstance();

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    tableManager.askForTableStructure(props.connection, props.table, props.structureTabId);
  }, [props.connection, props.table, props.structureTabId]);

  useEffect(() => {
    if (props.visible && !loaded) {
      setLoaded(true);
      load();
    }
  }, [props.visible, loaded, load]);

  useImperativeHandle(ref, () => ({reload: load}), [load]);

  /** column / index was changed - reload structure, data of the tab and table list */
  const change = useStructureChange(props.connection, props.table, props.structureTabId, (applied: StructureChangeType) => {
    setForm(null);
    load();
    tableManager.askForTableList(props.connection, {name: props.table.databaseName}, true);
    EventBus.emit<string>(new QueryRefreshWasRequested(props.dataTabId));
  });
  const sendChange = (changeData: StructureChangeType) => change.requestPreview(changeData);

  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.payload?.tabId !== props.structureTabId) {
        return;
      }
      if (message.message === MessageType.TABLE_STRUCTURE) {
        setStructure(message.payload as TableStructureInterface);
        setLoading(false);
      } else if (message.message === MessageType.QUERY_ERROR && !change.busy) {
        setError((message.payload as QueryErrorInterface).error);
        setLoading(false);
      }
    });
    return () => EventBus.unSub(eventId);
  }, [props.structureTabId, change.busy]);

  const copyDdl = () => {
    if (!structure) return;
    navigator.clipboard?.writeText(`${structure.ddl};`)
      .then(() => toast.success('DDL copied'))
      .catch(() => toast.error('Unable to copy'));
  };

  const openMenu = (event: MouseEvent, kind: 'column' | 'index', name: string) => {
    event.preventDefault();
    setMenu({x: event.clientX, y: event.clientY, kind, name});
  };

  const isTable = !!structure?.info && !/VIEW/i.test(structure.info.type);
  const canChange = isTable && !props.gone && !connection.readOnly;

  const menuItems = (state: NonNullable<MenuState>): ContextMenuItem[] => {
    const copyName: ContextMenuItem = {
      label: 'Copy name',
      onClick: () => navigator.clipboard?.writeText(state.name).then(() => toast.success('Copied')),
    };
    if (!canChange) {
      return [copyName];
    }
    if (state.kind === 'index') {
      return [
        copyName,
        'separator',
        {label: 'Drop index', danger: true, onClick: () => sendChange({kind: 'alter', operations: [{op: 'dropIndex', name: state.name}]})},
      ];
    }
    const column = structure!.columns.find((item) => item.name === state.name)!;
    return [
      copyName,
      'separator',
      {
        label: column.generationExpression ? 'Change column… (generated - use SQL)' : 'Change column…',
        disabled: !!column.generationExpression,
        onClick: () => setForm({type: 'column', column}),
      },
      DriverFactory.getDriver(props.connection).features.columnPosition
        ? {label: 'Add column after…', onClick: () => setForm({type: 'column', after: column.name})}
        : {label: 'Add column…', onClick: () => setForm({type: 'column'})},
      {label: 'Add index on column…', onClick: () => setForm({type: 'index'})},
      'separator',
      {
        label: 'Drop column',
        danger: true,
        disabled: structure!.columns.length <= 1,
        onClick: () => sendChange({kind: 'alter', operations: [{op: 'dropColumn', name: column.name}]}),
      },
    ];
  };

  const foreignKeyRows = (keys: StructureForeignKeyInterface[], incoming: boolean) => keys.map((key) => (
    <tr key={`${key.table.databaseName}.${key.table.name}.${key.name}`}>
      <td>{key.name}</td>
      {incoming && <td><TableLink table={key.table} current={props.table} onOpen={props.onOpenTable} /></td>}
      <td>{key.columns.join(', ')}</td>
      {!incoming && <td><TableLink table={key.referencedTable} current={props.table} onOpen={props.onOpenTable} /></td>}
      <td>{key.referencedColumns.join(', ')}</td>
      <td>{key.onUpdate}</td>
      <td>{key.onDelete}</td>
    </tr>
  ));

  const addButton = (label: string, onClick: () => void) => canChange && (
    <button type="button" className="structure-section-action" onClick={onClick}>{label}</button>
  );

  return (
    <div className="cmp-structure-view">
      {props.gone && <div className="structure-gone">{props.gone}</div>}
      {loading && !structure && <div className="structure-loading">Loading…</div>}
      {error && <div className="structure-error">{error}</div>}

      {structure && (
        <div className="structure-content">
          {structure.warnings.length > 0 && (
            <div className="structure-warning">{structure.warnings.map((warning) => <div key={warning}>{warning}</div>)}</div>
          )}

          {structure.info && (
            <div className="structure-info">
              <div><span>Type</span>{structure.info.type}</div>
              {structure.info.engine && <div><span>{DriverFactory.getDriver(props.connection).dialect === 'postgresql' ? 'Access method' : 'Engine'}</span>{structure.info.engine}</div>}
              {structure.info.collation && <div><span>Collation</span>{structure.info.collation}</div>}
              {structure.info.rowFormat && <div><span>Row format</span>{structure.info.rowFormat}</div>}
              {structure.info.rows !== null && <div title="Approximate for InnoDB"><span>Rows</span>~{structure.info.rows.toLocaleString()}</div>}
              {structure.info.dataLength !== null && <div><span>Data</span>{formatBytes(structure.info.dataLength)}</div>}
              {structure.info.indexLength !== null && <div><span>Indexes</span>{formatBytes(structure.info.indexLength)}</div>}
              {structure.info.autoIncrement !== null && <div><span>Auto increment</span>{structure.info.autoIncrement}</div>}
              {structure.info.createTime && <div><span>Created</span>{structure.info.createTime}</div>}
              {structure.info.updateTime && <div><span>Updated</span>{structure.info.updateTime}</div>}
              {structure.info.comment && <div className="wide"><span>Comment</span>{structure.info.comment}</div>}
            </div>
          )}

          <Section title="Columns" count={structure.columns.length} action={addButton('+ Add column', () => setForm({type: 'column'}))}>
            <table className="structure-table">
              <thead><tr><th>#</th><th>Name</th><th>Type</th><th>Null</th><th>Default</th><th>Key</th><th>Extra</th><th>Collation</th><th>Comment</th></tr></thead>
              <tbody>
                {structure.columns.map((column, index) => (
                  <tr
                    key={column.name}
                    className="structure-row"
                    onContextMenu={(event) => openMenu(event, 'column', column.name)}
                    onDoubleClick={() => canChange && !column.generationExpression && setForm({type: 'column', column})}
                  >
                    <td className="muted">{index + 1}</td>
                    <td className="name">{column.name}</td>
                    <td className="type">{column.type}</td>
                    <td>{column.nullable ? 'YES' : 'NO'}</td>
                    <td>
                      {column.defaultValue === null
                        ? <span className="muted">{column.nullable ? 'NULL' : '—'}</span>
                        : column.defaultIsExpression ? <span className="expression">{column.defaultValue}</span> : column.defaultValue}
                    </td>
                    <td>{column.key}</td>
                    <td>{column.extra}{column.generationExpression && <span className="muted"> AS {column.generationExpression}</span>}</td>
                    <td className="muted">{column.collation}</td>
                    <td>{column.comment}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {isTable && (
            <Section title="Indexes" count={structure.indexes.length} empty={!structure.indexes.length} action={addButton('+ Add index', () => setForm({type: 'index'}))}>
              <table className="structure-table">
                <thead><tr><th>Name</th><th>Columns</th><th>Unique</th><th>Type</th><th>Comment</th></tr></thead>
                <tbody>
                  {structure.indexes.map((index) => (
                    <tr key={index.name} className="structure-row" onContextMenu={(event) => openMenu(event, 'index', index.name)}>
                      <td className="name">{index.name}</td>
                      <td>{index.columns.map((column) => `${column.name}${column.subPart ? `(${column.subPart})` : ''}${column.descending ? ' DESC' : ''}`).join(', ')}</td>
                      <td>{index.primary ? 'PRIMARY' : index.unique ? 'YES' : 'NO'}</td>
                      <td>{index.type}</td>
                      <td>{index.comment}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {isTable && (
            <Section title="Foreign keys" count={structure.foreignKeys.length} empty={!structure.foreignKeys.length}>
              <table className="structure-table">
                <thead><tr><th>Name</th><th>Columns</th><th>References</th><th>Columns</th><th>On update</th><th>On delete</th></tr></thead>
                <tbody>{foreignKeyRows(structure.foreignKeys, false)}</tbody>
              </table>
            </Section>
          )}

          {isTable && (
            <Section title="Referenced by" count={structure.referencedBy.length} empty={!structure.referencedBy.length}>
              <table className="structure-table">
                <thead><tr><th>Name</th><th>Table</th><th>Columns</th><th>Referenced columns</th><th>On update</th><th>On delete</th></tr></thead>
                <tbody>{foreignKeyRows(structure.referencedBy, true)}</tbody>
              </table>
            </Section>
          )}

          {isTable && (
            <Section title="Triggers" count={structure.triggers.length} empty={!structure.triggers.length}>
              <table className="structure-table">
                <thead><tr><th>Name</th><th>Timing</th><th>Event</th><th>Statement</th></tr></thead>
                <tbody>
                  {structure.triggers.map((trigger) => (
                    <tr key={trigger.name}>
                      <td className="name">{trigger.name}</td>
                      <td>{trigger.timing}</td>
                      <td>{trigger.event}</td>
                      <td className="code">{trigger.statement}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          <Section title="DDL">
            <div className="structure-ddl">
              <button type="button" className="structure-action copy" onClick={copyDdl}>Copy</button>
              <SyntaxHighlighter language="sql" style={theme === 'light' ? prism : darcula} customStyle={{margin: 0, padding: '12px 14px', background: 'transparent', fontSize: '0.85rem'}}>
                {`${structure.ddl};`}
              </SyntaxHighlighter>
            </div>
          </Section>
        </div>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu)} onClose={() => setMenu(null)} />}

      {form?.type === 'column' && structure && (
        <ColumnForm
          features={DriverFactory.getDriver(props.connection).features}
          column={form.column}
          after={form.after}
          columns={structure.columns}
          busy={change.busy}
          onCancel={() => setForm(null)}
          onPreview={(definition, position) => sendChange({
            kind: 'alter',
            operations: [form.column
              ? {op: 'changeColumn', name: form.column.name, column: definition, position}
              : {op: 'addColumn', column: definition, position}],
          })}
        />
      )}

      {form?.type === 'index' && structure && (
        <IndexForm
          features={DriverFactory.getDriver(props.connection).features}
          columns={structure.columns}
          hasPrimaryKey={structure.indexes.some((index) => index.primary)}
          busy={change.busy}
          onCancel={() => setForm(null)}
          onPreview={(name, kind, columns) => sendChange({kind: 'alter', operations: [{op: 'addIndex', name, kind, columns}]})}
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
});
