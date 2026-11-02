import React, {useEffect, useRef, useState} from 'react';
import toast from 'react-hot-toast';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import TableManager from '../../../Library/Table/TableManager';
import EventBus from '../../../Library/EventBus/EventBus';
import TableInformationWasReceived from '../../../Library/Table/Event/TableInformationWasReceived';
import WebsocketReceivedAMessage from '../../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../../Library/WebSocket/Interface/MessageInterface';
import MessageType from '../../../Library/WebSocket/Enum/MessageType';
import TransferApi from '../../../Library/Transfer/TransferApi';
import DriverFactory from '../../../Library/Database/Driver/DriverFactory';
import {DumpFinishedInterface, DumpInsertModeType, DumpProgressInterface, DumpTableModeType} from '../../../Library/Transfer/TransferInterface';
import {formatBytes} from '../../../Library/Record/BinaryValue';
import ConsoleApi from '../../../Library/Console/ConsoleApi';

/** text shown in page - bigger dump would make browser slow */
const TEXT_LIMIT_BYTES = 5 * 1024 * 1024;

const MODES: {mode: DumpTableModeType, label: string}[] = [
  {mode: 'both', label: 'Structure & data'},
  {mode: 'structure', label: 'Structure'},
  {mode: 'data', label: 'Data'},
];

const INSERT_MODES: {mode: DumpInsertModeType, label: string, title: string}[] = [
  {mode: 'insert', label: 'INSERT', title: 'Rows for an empty table'},
  {mode: 'ignore', label: 'INSERT, skip existing rows', title: 'Rows with existing primary / unique key are skipped (INSERT IGNORE, ON CONFLICT DO NOTHING)'},
  {mode: 'upsert', label: 'INSERT or update existing rows', title: 'Existing rows get values of the dump (ON DUPLICATE KEY UPDATE, ON CONFLICT DO UPDATE) - needs primary key'},
  {mode: 'update', label: 'UPDATE existing rows', title: 'UPDATE ... WHERE primary key for every row, missing rows are not added - needs primary key'},
];

interface ExportPanelPropsInterface {
  connection: ConnectionDataInterface;
  database: string;
  /** only this table is selected at start */
  table?: string;
  /** these tables are selected at start */
  tables?: string[];
  tabId: string;
}

/** ExportPanel - SQL dump of database or selected tables */
export default (props: ExportPanelPropsInterface) => {
  const tableManager = TableManager.getInstance();
  const listTables = () => tableManager.getTablesListForDatabase(props.connection, {name: props.database}).map((table) => table.tableName).sort();
  const [tables, setTables] = useState<string[]>(listTables());
  /** selection given by opener - whole database otherwise */
  const initial = props.table ? [props.table] : props.tables?.length ? props.tables : null;
  const [selected, setSelected] = useState<Set<string>>(new Set(initial || listTables()));
  /** tables without entry are dumped with structure and data */
  const [modes, setModes] = useState<{[table: string]: DumpTableModeType}>({});
  const [progress, setProgress] = useState<DumpProgressInterface | null>(null);
  /** Cancel was clicked - failed download / text reading is not an error then */
  const cancelling = useRef<boolean>(false);
  const [dropTables, setDropTables] = useState<boolean>(true);
  const [createDatabase, setCreateDatabase] = useState<boolean>(false);
  const [views, setViews] = useState<boolean>(true);
  const [triggers, setTriggers] = useState<boolean>(true);
  const [gzip, setGzip] = useState<boolean>(false);
  const [insertMode, setInsertMode] = useState<DumpInsertModeType>('insert');
  const [rowPerInsert, setRowPerInsert] = useState<boolean>(false);
  const [truncateData, setTruncateData] = useState<boolean>(false);
  const [running, setRunning] = useState<boolean>(false);
  const [result, setResult] = useState<DumpFinishedInterface | null>(null);
  const exportTabId = `${props.tabId}:export`;
  const features = DriverFactory.getDriver(props.connection).features;
  /** dump shown in page instead of download */
  const [output, setOutput] = useState<{text: string, truncated: boolean} | null>(null);
  const textMode = useRef<boolean>(false);
  /** user changed selection - reloaded table list must not change it */
  const touched = useRef<boolean>(!!initial);

  // table list may be loaded after the tab was opened
  useEffect(() => {
    tableManager.askForTableList(props.connection, {name: props.database}, false);
    const eventId = EventBus.subscribe(TableInformationWasReceived.name, () => {
      const list = listTables();
      setTables(list);
      // whole database is selected until user changes the selection
      if (!touched.current) {
        setSelected(new Set(list));
      }
    });
    return () => EventBus.unSub(eventId);
  }, [props.connection, props.database]);

  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<DumpFinishedInterface>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.payload?.tabId !== exportTabId) return;
      if (message.message === MessageType.DUMP_PROGRESS) {
        setProgress(message.payload as unknown as DumpProgressInterface);
        return;
      }
      if (message.message === MessageType.DUMP_FINISHED) {
        setRunning(false);
        setProgress(null);
        if (cancelling.current) {
          toast('Export was cancelled - the file is not complete');
          return;
        }
        // shown text was cut on purpose - server reports cancelled download
        if (textMode.current && message.payload.error) {
          return;
        }
        if (message.payload.cancelled) {
          toast('Download was cancelled');
          return;
        }
        setResult(message.payload);
        if (message.payload.withoutPrimaryKey?.length) {
          toast(`Without primary key, rows are plain INSERT: ${message.payload.withoutPrimaryKey.join(', ')}`, {duration: 8000});
        }
        message.payload.error
          ? toast.error(`Dump is not complete: ${message.payload.error}`)
          : toast.success(`Dump finished: ${message.payload.tables} table(s), ${message.payload.rows.toLocaleString()} row(s)`);
      }
    });
    return () => EventBus.unSub(eventId);
  }, [exportTabId]);

  const toggle = (name: string) => setSelected((previous) => {
    touched.current = true;
    const next = new Set(previous);
    next.has(name) ? next.delete(name) : next.add(name);
    return next;
  });

  const allSelected = tables.length > 0 && tables.every((name) => selected.has(name));
  // own keys only - table named constructor / toString must not get a method of Object
  const modeOf = (name: string): DumpTableModeType => Object.prototype.hasOwnProperty.call(modes, name) ? modes[name] : 'both';
  const chosen = tables.filter((name) => selected.has(name));
  /** DROP, views and triggers belong to structure */
  const anyStructure = chosen.some((name) => modeOf(name) !== 'data');
  const anyData = chosen.some((name) => modeOf(name) !== 'structure');
  /** TRUNCATE is written only for tables without CREATE TABLE */
  const anyDataOnly = chosen.some((name) => modeOf(name) === 'data');
  const setMode = (name: string, mode: DumpTableModeType) => setModes((previous) => ({...previous, [name]: mode}));
  /** header radio - mode of all selected tables */
  const setAllModes = (mode: DumpTableModeType) => setModes((previous) => ({...previous, ...Object.fromEntries(chosen.map((name) => [name, mode]))}));
  const allHaveMode = (mode: DumpTableModeType) => chosen.length > 0 && chosen.every((name) => modeOf(name) === mode);

  const cancel = () => {
    cancelling.current = true;
    ConsoleApi.getInstance().cancel(props.connection, exportTabId);
  };

  const percent = !progress ? 0 : Math.min(99, Math.floor(progress.estimatedRows > 0
    ? progress.rows / progress.estimatedRows * 100
    : progress.tablesDone / Math.max(1, progress.tablesTotal) * 100));

  /** asText - dump is shown in page (like "view output as text" of phpMyAdmin), otherwise downloaded */
  const start = async (asText: boolean) => {
    setRunning(true);
    setResult(null);
    setProgress(null);
    cancelling.current = false;
    textMode.current = asText;
    if (asText) setOutput(null);
    try {
      const ticket = await TransferApi.requestTicket(props.connection, exportTabId, {
        kind: 'dump',
        options: {
          database: props.database,
          // all tables - also tables created later than the list was loaded (with structure and data)
          tables: allSelected && !props.table ? [] : chosen,
          structure: true,
          data: true,
          tableModes: Object.fromEntries(chosen.map((name) => [name, modeOf(name)])),
          dropTables,
          createDatabase,
          views,
          triggers,
          insertMode,
          rowPerInsert,
          truncateData,
        },
        gzip: gzip && !asText,
      });
      if (asText) {
        const shown = await TransferApi.fetchText(ticket, TEXT_LIMIT_BYTES);
        setOutput(shown);
        if (shown.truncated) {
          setRunning(false);
          toast(`Only first ${formatBytes(TEXT_LIMIT_BYTES)} are shown - download the dump for all data`);
        }
      } else {
        TransferApi.download(ticket);
      }
    } catch (e: any) {
      setRunning(false);
      setProgress(null);
      if (!cancelling.current) {
        toast.error(e?.message || String(e));
      }
    }
  };

  const copyOutput = () => output && navigator.clipboard?.writeText(output.text)
    .then(() => toast.success('Copied'))
    .catch(() => toast.error('Unable to copy'));

  const downloadOutput = () => {
    if (!output) return;
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([output.text], {type: 'application/sql'}));
    link.download = `${props.database}${props.table ? `-${props.table}` : ''}.sql`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  return (
    <section className="transfer-panel">
      <h3>Export (SQL dump)</h3>
      <div className="transfer-columns">
        <div className="transfer-tables">
          <div className="transfer-table-list export-table-list">
            <table className="export-tables">
              <thead>
                <tr>
                  <th>
                    <label className="transfer-check select-all">
                      <input type="checkbox" checked={allSelected} onChange={() => { touched.current = true; setSelected(allSelected ? new Set() : new Set(tables)); }} />
                      Table ({selected.size} / {tables.length})
                    </label>
                  </th>
                  {MODES.map(({mode, label}) => (
                    <th key={mode} className="export-mode">
                      <label title={`${label} of all selected tables`}>
                        <input type="radio" name={`${exportTabId}-all`} checked={allHaveMode(mode)} disabled={!chosen.length} onChange={() => setAllModes(mode)} />
                        {label}
                      </label>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tables.map((name) => (
                  <tr key={name} className={selected.has(name) ? '' : 'skipped'}>
                    <td>
                      <label className="transfer-check">
                        <input type="checkbox" checked={selected.has(name)} onChange={() => toggle(name)} />{name}
                      </label>
                    </td>
                    {MODES.map(({mode, label}) => (
                      <td key={mode} className="export-mode">
                        <input
                          type="radio"
                          name={`${exportTabId}-${name}`}
                          aria-label={`${label} of ${name}`}
                          checked={modeOf(name) === mode}
                          disabled={!selected.has(name)}
                          onChange={() => setMode(name, mode)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="transfer-options">
          <label className="transfer-check"><input type="checkbox" checked={dropTables} disabled={!anyStructure} onChange={(e) => setDropTables(e.target.checked)} />DROP before CREATE</label>
          <label className="transfer-check"><input type="checkbox" checked={views} disabled={!anyStructure} onChange={(e) => setViews(e.target.checked)} />Views</label>
          <label className="transfer-check"><input type="checkbox" checked={triggers} disabled={!anyStructure} onChange={(e) => setTriggers(e.target.checked)} />Triggers</label>
          <label className="transfer-check"><input type="checkbox" checked={createDatabase} onChange={(e) => setCreateDatabase(e.target.checked)} />{features.dumpCreateDatabaseLabel}</label>
          <label className="export-insert-mode" title={INSERT_MODES.find((item) => item.mode === insertMode)?.title}>
            Data as
            <select value={insertMode} disabled={!anyData} onChange={(e) => setInsertMode(e.target.value as DumpInsertModeType)}>
              {INSERT_MODES.map((item) => <option key={item.mode} value={item.mode} title={item.title}>{item.label}</option>)}
            </select>
          </label>
          <label className="transfer-check" title="One statement for every row - easy to diff or to cut, slower import">
            <input type="checkbox" checked={rowPerInsert} disabled={!anyData || insertMode === 'update'} onChange={(e) => setRowPerInsert(e.target.checked)} />One row per INSERT
          </label>
          <label className="transfer-check" title="Rows of tables exported as Data only are removed before their data. PostgreSQL: a table referenced by foreign key of other table can be emptied only together with that table">
            <input type="checkbox" checked={truncateData} disabled={!anyDataOnly || insertMode === 'update'} onChange={(e) => setTruncateData(e.target.checked)} />TRUNCATE before data (Data only tables)
          </label>
          <label className="transfer-check"><input type="checkbox" checked={gzip} onChange={(e) => setGzip(e.target.checked)} />Compress (.sql.gz)</label>
          <div className="export-actions">
            <button
              type="button"
              className="transfer-start"
              disabled={running || !selected.size}
              onClick={() => start(false)}
            >
              {running && !textMode.current ? 'Exporting…' : 'Download dump'}
            </button>
            <button
              type="button"
              className="transfer-start secondary"
              title={`Show SQL in page (first ${formatBytes(TEXT_LIMIT_BYTES)})`}
              disabled={running || !selected.size}
              onClick={() => start(true)}
            >
              {running && textMode.current ? 'Exporting…' : 'Show as text'}
            </button>
            {running && <button type="button" className="transfer-cancel" onClick={cancel}>Cancel</button>}
          </div>
          {running && (
            <div className="import-progress export-progress">
              <div className="progress-bar"><div style={{width: `${percent}%`}} /></div>
              <div className="progress-text">
                {!progress ? 'Starting…' : <>
                  {percent}%
                  {progress.table && ` · ${progress.table}`}
                  {` (${Math.min(progress.tablesDone + 1, progress.tablesTotal)} / ${progress.tablesTotal})`}
                  {` · ${progress.rows.toLocaleString()}${progress.estimatedRows ? ` / ~${progress.estimatedRows.toLocaleString()}` : ''} row(s)`}
                  {` · ${formatBytes(progress.bytes)}`}
                </>}
              </div>
            </div>
          )}
          {result && !result.error && (
            <div className="transfer-result">
              {result.tables} table(s), {result.rows.toLocaleString()} row(s), {formatBytes(result.bytes)}{gzip ? ' before compression' : ''}
              {!!result.withoutPrimaryKey?.length && <div className="transfer-warning">Without primary key, rows are plain INSERT: {result.withoutPrimaryKey.join(', ')}</div>}
            </div>
          )}
          {result?.error && <div className="transfer-error">{result.error}</div>}
          <div className="transfer-hint">{features.dumpHint}</div>
        </div>
      </div>
      {output && (
        <div className="export-output">
          <div className="export-output-bar">
            <span>{formatBytes(new Blob([output.text]).size)}{output.truncated ? ' - cut, download the dump for all data' : ''}</span>
            <button type="button" onClick={copyOutput}>Copy</button>
            <button type="button" onClick={downloadOutput}>Download shown text</button>
            <button type="button" onClick={() => setOutput(null)}>Close</button>
          </div>
          <textarea readOnly value={output.text} spellCheck={false} />
        </div>
      )}
    </section>
  );
}
