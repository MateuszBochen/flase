import React, {MouseEvent as ReactMouseEvent, useCallback, useEffect, useRef, useState} from 'react';
import toast from 'react-hot-toast';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faFloppyDisk, faForwardFast, faMagnifyingGlassChart, faPlay, faStop} from '@fortawesome/free-solid-svg-icons';
import ApplicationInterface from '../ApplicationInterface';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import Editor from '../../../UI/Editor/Editor';
import {CompletionTableType} from '../../../UI/Editor/SqlCompletion';
import TableManager from '../../../Library/Table/TableManager';
import DriverFactory from '../../../Library/Database/Driver/DriverFactory';
import DatabaseManger from '../../../Library/Database/DatabaseManger';
import ConnectionManager from '../../../Library/Connection/ConnectionManager';
import EventBus from '../../../Library/EventBus/EventBus';
import DatabaseWasReceived from '../../../Library/Database/Event/DatabaseWasReceived';
import useStatementRunner, {StatementLogType} from '../../../Library/Console/useStatementRunner';
import {selectedDatabaseOf, splitSql, statementAt} from '../../../Library/Console/SqlSplitter';
import QueryStore from '../../../Library/Console/QueryStore';
import ConsoleResult from './ConsoleResult';
import QueryLibrary from './QueryLibrary';
import './style.css';
import useConnectionSettings from '../../../Library/Connection/useConnectionSettings';

export interface SqlConsolePropsInterface extends ApplicationInterface {
  connection: ConnectionDataInterface;
  /** database selected when console is opened */
  database?: string | null;
}

const MAX_ROWS = 1000;

/** RAISE NOTICE / WARNING of PostgreSQL statement */
const noticesOf = (log: StatementLogType): string[] => log.result?.kind === 'ok'
  ? log.result.message.split('\n').filter((line) => /^(NOTICE|WARNING|INFO|LOG|DEBUG):/.test(line))
  : [];

const describeResult = (log: StatementLogType): string => {
  if (log.status === 'waiting') return 'waiting';
  if (log.status === 'running') return 'running…';
  if (log.status === 'skipped') return 'not executed';
  if (log.error) return log.error;
  if (log.result?.kind === 'rows') {
    return log.result.truncated
      ? `${log.result.rows.toLocaleString()} rows, first ${MAX_ROWS.toLocaleString()} shown`
      : `${log.result.rows.toLocaleString()} row(s)`;
  }
  if (log.result?.kind === 'ok') {
    const parts = [`${log.result.affectedRows} row(s) affected`];
    if (log.result.insertId) parts.push(`insert id ${log.result.insertId}`);
    if (log.result.warningCount) parts.push(`${log.result.warningCount} warning(s)`);
    return parts.join(', ');
  }
  return '';
};

/** SqlConsole - many statements, results in tabs, history and saved queries */
export default (props: SqlConsolePropsInterface) => {
  const [database, setDatabase] = useState<string | null>(props.database ?? null);
  const [databases, setDatabases] = useState<string[]>([]);
  const [activeResult, setActiveResult] = useState<'messages' | number>('messages');
  const [editorHeight, setEditorHeight] = useState<number>(220);
  const editorRef = useRef<any>(null);
  const store = QueryStore.getInstance();
  const driver = DriverFactory.getDriver(props.connection);
  const connection = useConnectionSettings(props.connection);

  const runner = useStatementRunner(props.connection, `${props.tabId}:console`, (statement, statementDatabase) => {
    store.addHistory(props.connection.id, {
      sql: statement.sql,
      database: statementDatabase,
      executedAt: Date.now(),
      durationMs: statement.durationMs,
      error: statement.error,
    });
    // USE (SET search_path) in console changes selected database
    const selected = selectedDatabaseOf(statement.sql);
    if (selected && !statement.error) {
      setDatabase(selected);
    }
  });

  /** databases of connection for the select */
  useEffect(() => {
    const refresh = () => {
      try {
        const established = ConnectionManager.getInstance().getEstablishedConnection(props.connection);
        setDatabases(DatabaseManger.getInstance().getListOfDatabaseForConnection(established).map((item) => item.name));
      } catch (e) {
        setDatabases([]);
      }
    };
    refresh();
    try {
      const established = ConnectionManager.getInstance().getEstablishedConnection(props.connection);
      if (!DatabaseManger.getInstance().getListOfDatabaseForConnection(established).length) {
        DatabaseManger.getInstance().aksForDatabaseList(established);
      }
    } catch (e) {}
    const eventId = EventBus.subscribe(DatabaseWasReceived.name, refresh);
    return () => EventBus.unSub(eventId);
  }, [props.connection]);

  // show first result when it comes, messages when nothing returned rows
  useEffect(() => {
    if (runner.resultIndexes.length === 1) {
      setActiveResult(runner.resultIndexes[0]);
    }
  }, [runner.resultIndexes]);

  const editorText = (): string => editorRef.current?.getValue() || '';

  /** selection, or statement under cursor */
  const currentStatements = (): string[] => {
    const editor = editorRef.current;
    if (!editor) return [];
    const model = editor.getModel();
    const selection = editor.getSelection();
    const selected = selection && !selection.isEmpty() ? model.getValueInRange(selection) : '';
    if (selected.trim()) {
      return splitSql(selected, driver.dialect).map((statement) => statement.sql);
    }
    const statement = statementAt(model.getValue(), model.getOffsetAt(editor.getPosition()), driver.dialect);
    return statement ? [statement.sql] : [];
  };

  const start = (statements: string[]) => {
    if (!statements.length) {
      toast.error('Nothing to execute');
      return;
    }
    setActiveResult('messages');
    runner.run(statements, database, MAX_ROWS);
  };

  const runCurrent = () => start(currentStatements());
  const runAll = () => start(splitSql(editorText(), driver.dialect).map((statement) => statement.sql));
  const explain = () => {
    const [statement] = currentStatements();
    if (!statement) {
      toast.error('Nothing to explain');
      return;
    }
    start([/^\s*explain\b/i.test(statement) ? statement : `EXPLAIN ${statement}`]);
  };

  // keyboard commands of monaco call the latest handlers
  const handlers = useRef({runCurrent, runAll});
  handlers.current = {runCurrent, runAll};

  const onEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => handlers.current.runCurrent());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => handlers.current.runAll());
    editor.focus();
  };

  /** text from history / saved queries is inserted at cursor */
  const insertText = useCallback((sql: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const model = editor.getModel();
    const before = model.getValueInRange({startLineNumber: 1, startColumn: 1, endLineNumber: selection.startLineNumber, endColumn: selection.startColumn});
    const prefix = before.trim() && !before.endsWith('\n') ? '\n' : '';
    const text = `${prefix}${sql.trim().replace(/;?$/, ';')}\n`;
    editor.executeEdits('query-library', [{range: selection, text, forceMoveMarkers: true}]);
    editor.focus();
  }, []);

  const saveQuery = () => {
    const statements = currentStatements();
    const sql = statements.join(';\n') || editorText().trim();
    if (!sql) {
      toast.error('Nothing to save');
      return;
    }
    const name = window.prompt('Name of saved query', sql.split('\n')[0].slice(0, 60));
    if (name?.trim()) {
      store.saveQuery(props.connection.id, {name: name.trim(), sql, database});
      toast.success('Query saved');
    }
  };

  // tables of selected database for completion - also database selected by USE, not opened in sidebar
  useEffect(() => {
    if (database && !TableManager.getInstance().getTablesListForDatabase(props.connection, {name: database}).length) {
      TableManager.getInstance().askForTableList(props.connection, {name: database}, false);
    }
  }, [database, props.connection]);

  const getCompletionTables = (): CompletionTableType[] => database
    ? TableManager.getInstance().getTablesListForDatabase(props.connection, {name: database}).map((table) => ({
      name: table.tableName,
      columns: table.columns.map((column) => ({name: column.name, type: column.type})),
    }))
    : [];

  /** editor height is changed by dragging the bar under it */
  const startResize = (event: ReactMouseEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = editorHeight;
    const onMove = (moveEvent: MouseEvent) => setEditorHeight(Math.max(80, startHeight + moveEvent.clientY - startY));
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const rowsResults = runner.resultIndexes.slice().sort((a, b) => a - b);

  return (
    <div className="cmp-sql-console">
      <div className="console-toolbar">
        {connection.readOnly && <span className="console-read-only" title="Statements changing data or structure fail">READ ONLY</span>}
        <select
          className="console-database"
          value={database || ''}
          title={`${driver.features.databaseLabel} for statements without ${driver.features.databaseLabel.toLowerCase()} name`}
          onChange={(event) => setDatabase(event.target.value || null)}
        >
          <option value="">— no {driver.features.databaseLabel.toLowerCase()} —</option>
          {database && !databases.includes(database) && <option value={database}>{database}</option>}
          {databases.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <button type="button" onClick={runCurrent} disabled={runner.running} title="Execute selection or statement under cursor (Ctrl+Enter)">
          <FontAwesomeIcon icon={faPlay} /> Run
        </button>
        <button type="button" onClick={runAll} disabled={runner.running} title="Execute all statements (Ctrl+Shift+Enter)">
          <FontAwesomeIcon icon={faForwardFast} /> Run all
        </button>
        <button type="button" onClick={explain} disabled={runner.running} title="EXPLAIN of statement under cursor">
          <FontAwesomeIcon icon={faMagnifyingGlassChart} /> Explain
        </button>
        {runner.running && (
          <button type="button" className="danger" onClick={runner.cancel} title="Stop running statement (KILL QUERY)">
            <FontAwesomeIcon icon={faStop} /> Cancel
          </button>
        )}
        <span className="console-spacer" />
        <button type="button" onClick={saveQuery} title="Save selection or statement under cursor">
          <FontAwesomeIcon icon={faFloppyDisk} /> Save…
        </button>
      </div>

      <div className="console-workspace" style={{height: editorHeight}}>
        <div className="console-editor">
          <Editor
            defaultText=""
            syntax="sql"
            customKeyWords={driver.keywords}
            completionName={(name) => driver.sql.completionName(name)}
            getCompletionTables={getCompletionTables}
            onEditorMount={onEditorMount}
          />
        </div>
        <QueryLibrary connection={props.connection} onInsert={insertText} onRun={(sql) => start(splitSql(sql, driver.dialect).map((statement) => statement.sql))} />
      </div>
      <div className="console-resize" onMouseDown={startResize} title="Drag to resize" />

      <div className="console-results">
        <div className="console-result-tabs" role="tablist">
          <button type="button" role="tab" className={activeResult === 'messages' ? 'active' : ''} onClick={() => setActiveResult('messages')}>
            Messages{runner.logs.some((log) => log.status === 'error') ? ' ⚠' : ''}
          </button>
          {rowsResults.map((index) => (
            <button key={index} type="button" role="tab" className={activeResult === index ? 'active' : ''} onClick={() => setActiveResult(index)}>
              Result {index + 1}
            </button>
          ))}
        </div>
        <div className="console-result-content">
          {activeResult === 'messages' ? (
            <div className="console-messages">
              {!runner.logs.length && <div className="console-hint">Ctrl+Enter executes selection or statement under cursor, Ctrl+Shift+Enter executes everything.</div>}
              {runner.logs.map((log) => (
                <React.Fragment key={log.index}>
                <div
                  className={`console-log ${log.status} ${rowsResults.includes(log.index) ? 'clickable' : ''}`}
                  onClick={() => rowsResults.includes(log.index) && setActiveResult(log.index)}
                >
                  <span className="log-status">{log.status === 'done' ? '✓' : log.status === 'error' ? '✕' : log.status === 'running' ? '…' : '·'}</span>
                  <span className="log-sql" title={log.sql}>{log.sql.replace(/\s+/g, ' ')}</span>
                  <span className="log-result">{describeResult(log)}</span>
                  <span className="log-time">{log.durationMs !== undefined ? `${log.durationMs} ms` : ''}</span>
                </div>
                {noticesOf(log).map((notice, index) => <div key={index} className="console-log-notice">{notice}</div>)}
                </React.Fragment>
              ))}
            </div>
          ) : (
            <ConsoleResult
              key={activeResult}
              buffer={runner.buffer(activeResult)}
              connection={props.connection}
              name={`result-${activeResult + 1}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
