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
import useConnectionSettings from '../../../Library/Connection/useConnectionSettings';
import Icon from '../../../UI/Icon/Icon';
import {faCircleCheck, faCircleXmark, faTriangleExclamation, faBan} from '@fortawesome/free-solid-svg-icons';

const OUTCOME_ICONS = {success: faCircleCheck, warning: faTriangleExclamation, failed: faCircleXmark, cancelled: faBan};

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
  const connection = useConnectionSettings(props.connection);
  const [file, setFile] = useState<File | null>(null);
  const [tables, setTables] = useState(tableManager.getTablesListForDatabase(props.connection, {name: props.database}));
  const [stopOnError, setStopOnError] = useState<boolean>(true);
  const [table, setTable] = useState<string>(props.table || '');
  const [delimiter, setDelimiter] = useState<string>(',');
  const [header, setHeader] = useState<boolean>(true);
  const [nullValue, setNullValue] = useState<CsvImportOptionsInterface['nullValue']>('empty');
  const [truncate, setTruncate] = useState<boolean>(false);
  const [ignoreForeignKeys, setIgnoreForeignKeys] = useState<boolean>(false);
  const [previewText, setPreviewText] = useState<string>('');
  const [mapping, setMapping] = useState<(string | null)[]>([]);
  const [running, setRunning] = useState<boolean>(false);
  const [uploaded, setUploaded] = useState<{sent: number, total: number}>({sent: 0, total: 0});
  const [progress, setProgress] = useState<ImportProgressInterface | null>(null);
  const [finished, setFinished] = useState<ImportFinishedInterface | null>(null);
  /** source of import - file or pasted text */
  const [source, setSource] = useState<'file' | 'text'>('file');
  const [pasted, setPasted] = useState<string>('');
  const [pastedFormat, setPastedFormat] = useState<'sql' | 'csv'>('sql');
  const importTabId = useRef<string>('');
  const counter = useRef<number>(0);

  const features = DriverFactory.getDriver(props.connection).features;
  const databaseLabel = features.databaseLabel.toLowerCase();
  const foreignKeysOption = (
    <label className="transfer-check" title={features.hints.importWithoutForeignKeys}>
      <input type="checkbox" checked={ignoreForeignKeys} onChange={(e) => setIgnoreForeignKeys(e.target.checked)} />Disable foreign key checks
    </label>
  );
  /** pasted text works as file - preview, mapping and upload are the same */
  const applyPasted = (text: string, format: 'sql' | 'csv') => {
    setFinished(null);
    setProgress(null);
    setFile(text.trim() ? new File([text], format === 'sql' ? 'pasted.sql' : 'pasted.csv', {type: 'text/plain'}) : null);
  };

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
          ignoreForeignKeys,
          options: {database: props.database, table, delimiter, header, columns: mapping, nullValue, truncate},
        }
        : {kind: 'import-sql', database: props.database, gzip: isGzip, stopOnError, fileName: file.name, ignoreForeignKeys});
      const result = await TransferApi.upload(ticket, importTabId.current, file, (sent, total) => setUploaded({sent, total}));
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
  // first half of the bar is upload, second half import - file is uploaded faster than it is imported
  const share = (done: number) => uploaded.total ? Math.min(1, done / uploaded.total) : 0;
  const uploadShare = finished ? 1 : share(uploaded.sent);
  const importShare = finished ? 1 : share(progress?.fileBytes ?? 0);
  const percent = Math.round((uploadShare + importShare) * 50);
  const outcome = !finished ? null : finished.cancelled ? 'cancelled' : finished.failed ? 'failed' : finished.errors.length ? 'warning' : 'success';
  const summary = finished && [
    isCsv ? `${finished.rows.toLocaleString()} row(s)` : `${finished.statements.toLocaleString()} statement(s)`,
    formatBytes(uploaded.total),
    `${(finished.durationMs / 1000).toFixed(1)} s`,
  ].join(' · ');
  const canStart = !connection.readOnly && !!file && !running && (!isCsv || (!!table && mapping.some((column) => !!column)));

  return (
    <section className="transfer-panel">
      <h3>Import</h3>
      {connection.readOnly && <div className="transfer-error">Connection is read only - import is not allowed.</div>}
      <div className="import-source">
        <label className="transfer-check"><input type="radio" checked={source === 'file'} disabled={running} onChange={() => { setSource('file'); setFile(null); }} />From file</label>
        <label className="transfer-check"><input type="radio" checked={source === 'text'} disabled={running} onChange={() => { setSource('text'); applyPasted(pasted, pastedFormat); }} />Paste text</label>
      </div>
      {source === 'text' && (
        <div className="import-text">
          <select value={pastedFormat} disabled={running} onChange={(e) => { const format = e.target.value as 'sql' | 'csv'; setPastedFormat(format); applyPasted(pasted, format); }}>
            <option value="sql">SQL statements</option>
            <option value="csv">CSV / TSV data</option>
          </select>
          <textarea
            value={pasted}
            disabled={running}
            spellCheck={false}
            placeholder={pastedFormat === 'sql' ? 'INSERT INTO …;' : 'name,email\nAnna,anna@example.com'}
            onChange={(e) => { setPasted(e.target.value); applyPasted(e.target.value, pastedFormat); }}
          />
        </div>
      )}
      <div className="import-file" style={source === 'text' ? {display: 'none'} : undefined}>
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
          {foreignKeysOption}
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
            {foreignKeysOption}
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
          {outcome && (
            <div className={`import-outcome ${outcome}`} role="status">
              <Icon icon={OUTCOME_ICONS[outcome]} />
              <div>
                <div className="import-outcome-title">
                  {outcome === 'success' && `Import completed into ${props.database}`}
                  {outcome === 'warning' && `Import completed with ${finished!.errors.length} error(s)`}
                  {outcome === 'failed' && (isCsv ? 'Import failed - nothing was saved' : 'Import stopped on error')}
                  {outcome === 'cancelled' && 'Import was cancelled'}
                </div>
                <div className="import-outcome-summary">{summary}</div>
              </div>
            </div>
          )}
          {!finished && (
            <>
              <div className="progress-bar import-bar" title={`Upload ${Math.round(uploadShare * 100)}% · import ${Math.round(importShare * 100)}%`}>
                <div className="import-bar-half"><div className="upload" style={{width: `${uploadShare * 100}%`}} /></div>
                <div className="import-bar-half"><div className="import" style={{width: `${importShare * 100}%`}} /></div>
              </div>
              <div className="progress-text">
                {percent}% · {uploadShare < 1 ? `uploading ${formatBytes(uploaded.sent)} / ${formatBytes(uploaded.total)}` : 'uploaded'}
                {' · '}importing {Math.round(importShare * 100)}%
                {progress && ` · ${isCsv ? `${progress.rows.toLocaleString()} row(s)` : `${progress.statements.toLocaleString()} statement(s)`}`}
              </div>
            </>
          )}
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
