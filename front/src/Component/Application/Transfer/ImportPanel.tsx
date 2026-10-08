import React, {useEffect, useMemo, useRef, useState} from 'react';
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
import ConsoleApi from '../../../Library/Console/ConsoleApi';
import CsvParser from '../../../Library/Transfer/CsvParser';
import {CsvImportOptionsInterface, ImportFinishedInterface, ImportProgressInterface} from '../../../Library/Transfer/TransferInterface';
import {formatBytes} from '../../../Library/Record/BinaryValue';

interface ImportPanelPropsInterface {
  connection: ConnectionDataInterface;
  database: string;
  /** target table of CSV import at start */
  table?: string;
  tabId: string;
}

const PREVIEW_BYTES = 64 * 1024;
const PREVIEW_ROWS = 8;

/** delimiter used most in the first line */
const detectDelimiter = (text: string): string => {
  const firstLine = text.split('\n')[0] || '';
  const counts = [',', ';', '\t', '|'].map((delimiter) => ({delimiter, count: firstLine.split(delimiter).length - 1}));
  return counts.sort((a, b) => b.count - a.count)[0].count > 0 ? counts[0].delimiter : ',';
};

/** ImportPanel - SQL script (also .gz) or CSV into existing table */
export default (props: ImportPanelPropsInterface) => {
  const tableManager = TableManager.getInstance();
  const [file, setFile] = useState<File | null>(null);
  const [tables, setTables] = useState(tableManager.getTablesListForDatabase(props.connection, {name: props.database}));
  const [stopOnError, setStopOnError] = useState<boolean>(true);
  const [table, setTable] = useState<string>(props.table || '');
  const [delimiter, setDelimiter] = useState<string>(',');
  const [header, setHeader] = useState<boolean>(true);
  const [nullValue, setNullValue] = useState<CsvImportOptionsInterface['nullValue']>('empty');
  const [truncate, setTruncate] = useState<boolean>(false);
  const [previewText, setPreviewText] = useState<string>('');
  const [mapping, setMapping] = useState<(string | null)[]>([]);
  const [running, setRunning] = useState<boolean>(false);
  const [uploaded, setUploaded] = useState<{sent: number, total: number}>({sent: 0, total: 0});
  const [progress, setProgress] = useState<ImportProgressInterface | null>(null);
  const [finished, setFinished] = useState<ImportFinishedInterface | null>(null);
  const importTabId = useRef<string>('');
  const counter = useRef<number>(0);

  const databaseLabel = DriverFactory.getDriver(props.connection).features.databaseLabel.toLowerCase();
  const isGzip = !!file && /\.gz$/i.test(file.name);
  const isCsv = !!file && /\.(csv|tsv|txt)(\.gz)?$/i.test(file.name);

  useEffect(() => {
    const eventId = EventBus.subscribe(TableInformationWasReceived.name, () => {
      setTables(tableManager.getTablesListForDatabase(props.connection, {name: props.database}));
    });
    tableManager.askForTableList(props.connection, {name: props.database}, false);
    return () => EventBus.unSub(eventId);
  }, [props.connection, props.database]);

  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (!importTabId.current || message.payload?.tabId !== importTabId.current) return;
      if (message.message === MessageType.IMPORT_PROGRESS) {
        setProgress(message.payload);
      }
    });
    return () => EventBus.unSub(eventId);
  }, []);

  /** beginning of CSV file for preview and column mapping */
  useEffect(() => {
    setPreviewText('');
    if (!file || !isCsv || isGzip) return;
    file.slice(0, PREVIEW_BYTES).text().then((text) => {
      setPreviewText(text);
      setDelimiter(/\.tsv$/i.test(file.name) ? '\t' : detectDelimiter(text));
    });
  }, [file]);

  const previewRows = useMemo(() => {
    if (!previewText) return [];
    const parser = new CsvParser(delimiter);
    // last line of preview can be cut - only complete rows are shown
    return parser.push(previewText).slice(0, PREVIEW_ROWS + 1).map((row) => row.values);
  }, [previewText, delimiter]);

  const targetColumns = (tables.find((item) => item.tableName === table)?.columns || []).filter((column) => column.editable !== false);
  const csvColumns = Math.max(0, ...previewRows.map((row) => row.length));

  // default mapping - by header name, otherwise by position
  useEffect(() => {
    if (!csvColumns || !targetColumns.length) return;
    const names = targetColumns.map((column) => column.name);
    setMapping(Array.from({length: csvColumns}, (value, index) => {
      if (header) {
        const name = (previewRows[0]?.[index] || '').trim().toLowerCase();
        return names.find((column) => column.toLowerCase() === name) || null;
      }
      return names[index] || null;
    }));
  }, [csvColumns, table, header, tables]);

  const start = async () => {
    if (!file) return;
    importTabId.current = `${props.tabId}:import:${++counter.current}`;
    setRunning(true);
    setFinished(null);
    setProgress(null);
    setUploaded({sent: 0, total: file.size});
    try {
      const ticket = await TransferApi.requestTicket(props.connection, importTabId.current, isCsv
        ? {
          kind: 'import-csv',
          gzip: isGzip,
          fileName: file.name,
          options: {database: props.database, table, delimiter, header, columns: mapping, nullValue, truncate},
        }
        : {kind: 'import-sql', database: props.database, gzip: isGzip, stopOnError, fileName: file.name});
      const result = await TransferApi.upload(ticket, file, (sent, total) => setUploaded({sent, total}));
      setFinished(result);
      if (result.cancelled) toast('Import was cancelled');
      else if (result.failed) toast.error('Import stopped on error');
      else toast.success(isCsv ? `Imported ${result.rows.toLocaleString()} row(s)` : `Executed ${result.statements.toLocaleString()} statement(s)`);
      // new / changed tables
      tableManager.askForTableList(props.connection, {name: props.database}, true);
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setRunning(false);
    }
  };

  const current = finished || progress;
  const percent = uploaded.total ? Math.round(uploaded.sent / uploaded.total * 100) : 0;
  const canStart = !!file && !running && (!isCsv || (!!table && mapping.some((column) => !!column)));

  return (
    <section className="transfer-panel">
      <h3>Import</h3>
      <div className="import-file">
        <input
          type="file"
          accept=".sql,.gz,.csv,.tsv,.txt"
          disabled={running}
          onChange={(event) => { setFile(event.target.files?.[0] || null); setFinished(null); setProgress(null); }}
        />
        {file && <span className="transfer-hint">{isCsv ? 'CSV' : 'SQL script'}{isGzip ? ' (gzip)' : ''} · {formatBytes(file.size)}</span>}
      </div>

      {file && !isCsv && (
        <div className="transfer-options inline">
          <span>into {databaseLabel} <b>{props.database}</b> ({databaseLabel === 'schema' ? 'SET search_path' : 'USE'} in script can change it)</span>
          <label className="transfer-check"><input type="checkbox" checked={stopOnError} onChange={(e) => setStopOnError(e.target.checked)} />Stop on first error</label>
        </div>
      )}

      {file && isCsv && (
        <div className="csv-options">
          <div className="transfer-options inline">
            <label>Table
              <select value={table} onChange={(e) => setTable(e.target.value)}>
                <option value="">— select —</option>
                {tables.map((item) => <option key={item.tableName} value={item.tableName}>{item.tableName}</option>)}
              </select>
            </label>
            <label>Delimiter
              <select value={delimiter} onChange={(e) => setDelimiter(e.target.value)}>
                <option value=",">comma ,</option>
                <option value=";">semicolon ;</option>
                <option value={'\t'}>tab</option>
                <option value="|">pipe |</option>
              </select>
            </label>
            <label>NULL is
              <select value={nullValue} onChange={(e) => setNullValue(e.target.value as CsvImportOptionsInterface['nullValue'])}>
                <option value="empty">empty field (not quoted)</option>
                <option value="\N">\N</option>
                <option value="NULL">NULL text</option>
                <option value="none">nothing - no NULL values</option>
              </select>
            </label>
            <label className="transfer-check"><input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} />First row is header</label>
            <label className="transfer-check"><input type="checkbox" checked={truncate} onChange={(e) => setTruncate(e.target.checked)} />Empty table first (TRUNCATE)</label>
          </div>
          {isGzip && <div className="transfer-hint">Preview is not available for compressed CSV - columns are mapped by position.</div>}
          {previewRows.length > 0 && table && (
            <div className="csv-preview">
              <table>
                <thead>
                  <tr>
                    {Array.from({length: csvColumns}, (value, index) => (
                      <th key={index}>
                        <select
                          className={mapping[index] ? 'mapped' : ''}
                          value={mapping[index] || ''}
                          onChange={(e) => setMapping((previous) => previous.map((column, i) => i === index ? (e.target.value || null) : column))}
                        >
                          <option value="">— skip —</option>
                          {targetColumns.map((column) => <option key={column.name} value={column.name}>{column.name}</option>)}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, PREVIEW_ROWS + (header ? 1 : 0)).map((row, rowIndex) => (
                    <tr key={rowIndex} className={header && rowIndex === 0 ? 'header-row' : ''}>
                      {Array.from({length: csvColumns}, (value, index) => <td key={index}>{row[index]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="transfer-hint">Rows are inserted in one transaction - on error nothing is saved.</div>
        </div>
      )}

      <div className="import-actions">
        <button type="button" className="transfer-start" disabled={!canStart} onClick={start}>{running ? 'Importing…' : 'Start import'}</button>
        {running && (
          <button type="button" className="transfer-cancel" onClick={() => ConsoleApi.getInstance().cancel(props.connection, importTabId.current)}>Cancel</button>
        )}
      </div>

      {(running || finished) && (
        <div className="import-progress">
          <div className="progress-bar"><div style={{width: `${finished ? 100 : percent}%`}} /></div>
          <div className="progress-text">
            {formatBytes(uploaded.sent)} / {formatBytes(uploaded.total)} sent
            {current && ` · ${isCsv ? `${current.rows.toLocaleString()} row(s)` : `${current.statements.toLocaleString()} statement(s)`}`}
            {finished && ` · ${(finished.durationMs / 1000).toFixed(1)} s`}
            {finished?.cancelled && ' · cancelled'}
            {finished?.failed && (isCsv ? ' · failed, nothing was saved' : ' · stopped on error')}
          </div>
          {current && current.errors.length > 0 && (
            <div className="import-errors">
              {current.errors.map((error, index) => (
                <div key={index} className="import-error">
                  <div className="import-error-message">{error.error}</div>
                  {error.statement && <pre>{error.statement}</pre>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
