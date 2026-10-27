import React, {useEffect, useMemo, useState} from 'react';
import toast from 'react-hot-toast';
import ApplicationInterface from '../ApplicationInterface';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import ConnectionManager from '../../../Library/Connection/ConnectionManager';
import DatabaseManger from '../../../Library/Database/DatabaseManger';
import DriverFactory from '../../../Library/Database/Driver/DriverFactory';
import EventBus from '../../../Library/EventBus/EventBus';
import DatabaseWasReceived from '../../../Library/Database/Event/DatabaseWasReceived';
import WebsocketReceivedAMessage from '../../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../../Library/WebSocket/Interface/MessageInterface';
import MessageType from '../../../Library/WebSocket/Enum/MessageType';
import {compareSchema, migrationScript, SchemaCompareResultInterface, SchemaTableDiffInterface} from '../../../Library/Schema/SchemaCompare';
import openConsole from '../../DatabaseOperations/openConsole';
import './style.css';

export interface SchemaComparePropsInterface extends ApplicationInterface {
  connection: ConnectionDataInterface;
  /** source - target gets its structure */
  database: string;
}

const STATUS_LABELS: {[status in SchemaTableDiffInterface['status']]: string} = {create: 'new', alter: 'changed', drop: 'only in target'};

/** SchemaCompare - differences of two databases (also on other servers) and script which makes target the same as source */
export default (props: SchemaComparePropsInterface) => {
  const manager = ConnectionManager.getInstance();
  const driver = DriverFactory.getDriver(props.connection);
  const label = driver.features.databaseLabel.toLowerCase();
  /** connections of the same kind (MySQL / MariaDB or PostgreSQL) */
  const targets = manager.getEstablishedConnections().filter((item) => DriverFactory.getDriver(item.connection).dialect === driver.dialect);
  const [targetId, setTargetId] = useState<string>(props.connection.id);
  const target = targets.find((item) => item.connection.id === targetId) || null;
  const [databases, setDatabases] = useState<string[]>([]);
  const [targetDatabase, setTargetDatabase] = useState<string>('');
  const [result, setResult] = useState<SchemaCompareResultInterface | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const tabId = `${props.tabId}:schema-compare`;

  // databases of target connection
  useEffect(() => {
    if (!target) return;
    const refresh = () => setDatabases(DatabaseManger.getInstance().getListOfDatabaseForConnection(target).map((item) => item.name));
    refresh();
    if (!DatabaseManger.getInstance().getListOfDatabaseForConnection(target).length) {
      DatabaseManger.getInstance().aksForDatabaseList(target);
    }
    const eventId = EventBus.subscribe(DatabaseWasReceived.name, refresh);
    return () => EventBus.unSub(eventId);
  }, [targetId]);

  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.payload?.tabId !== tabId) return;
      if (message.message === MessageType.SCHEMA_COMPARE) {
        const compared = message.payload as SchemaCompareResultInterface;
        setResult(compared);
        // dropping of tables is chosen by user
        setChosen(new Set(compared.tables.filter((table) => table.status !== 'drop').map((table) => table.name)));
        setRunning(false);
      } else if (message.message === MessageType.QUERY_ERROR) {
        setError(message.payload.error);
        setRunning(false);
      }
    });
    return () => EventBus.unSub(eventId);
  }, [tabId]);

  const compare = () => {
    if (!target || !targetDatabase) return;
    setRunning(true);
    setError(null);
    setResult(null);
    compareSchema(props.connection, tabId, props.database, target, targetDatabase);
  };

  const targetName = target ? `${target.connection.displayName} / ${targetDatabase}` : '';
  const script = useMemo(
    () => result ? migrationScript(result, chosen, `${targetName} → structure of ${props.connection.displayName} / ${props.database}`) : '',
    [result, chosen],
  );
  const chosenStatements = result ? result.tables.filter((table) => chosen.has(table.name)).reduce((sum, table) => sum + table.dropForeignKeys.length + table.statements.length + table.addForeignKeys.length, 0) : 0;

  const toggle = (name: string) => setChosen((previous) => {
    const next = new Set(previous);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  return (
    <div className="cmp-schema-compare">
      <div className="compare-form">
        <span className="compare-side">
          <span className="compare-label">Source</span>
          <b>{props.connection.displayName} / {props.database}</b>
        </span>
        <span className="compare-arrow">→</span>
        <span className="compare-side">
          <span className="compare-label">Target</span>
          <select value={targetId} onChange={(event) => { setTargetId(event.target.value); setTargetDatabase(''); setDatabases([]); }} aria-label="Target connection">
            {targets.map((item) => <option key={item.connection.id} value={item.connection.id}>{item.connection.displayName}</option>)}
          </select>
          <select value={targetDatabase} onChange={(event) => setTargetDatabase(event.target.value)} aria-label={`Target ${label}`}>
            <option value="">— {label} —</option>
            {databases.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </span>
        <button type="button" className="compare-run" onClick={compare} disabled={!target || !targetDatabase || running}>{running ? 'Comparing…' : 'Compare'}</button>
      </div>
      <div className="compare-hint">
        Script changes target to the structure of source: tables, columns, indexes and foreign keys. Other connections of the same kind
        ({driver.dialect === 'mysql' ? 'MySQL / MariaDB' : 'PostgreSQL'}) can be target - log in to them in sidebar.
      </div>

      {error && <div className="compare-error">{error}</div>}
      {result && (
        <div className="compare-result">
          <div className="compare-tables">
            <div className="compare-summary">
              {result.tables.length
                ? `${result.tables.length} table(s) differ, ${result.same} the same`
                : `Structure is the same (${result.same} table(s))`}
            </div>
            {result.warnings.map((warning) => <div key={warning} className="compare-warning">{warning}</div>)}
            {result.tables.map((table) => (
              <div key={table.name} className={`compare-table ${table.status}`}>
                <label className="compare-table-name">
                  <input type="checkbox" checked={chosen.has(table.name)} onChange={() => toggle(table.name)} aria-label={`Include ${table.name}`} />
                  <span className="compare-status">{STATUS_LABELS[table.status]}</span>
                  <b>{table.name}</b>
                </label>
                <ul>
                  {table.changes.map((change, index) => <li key={index}>{change}</li>)}
                  {table.warnings.map((warning, index) => <li key={`w${index}`} className="compare-manual">{warning}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="compare-script">
            <div className="compare-script-toolbar">
              <span>{chosenStatements} statement(s) for {targetName}</span>
              <button type="button" disabled={!chosenStatements} onClick={() => navigator.clipboard?.writeText(script).then(() => toast.success('Copied')).catch(() => toast.error('Unable to copy'))}>Copy</button>
              <button
                type="button"
                disabled={!chosenStatements || !target}
                title="Script is opened in SQL console of target - check it and run it there"
                onClick={() => target && openConsole(target.connection, targetDatabase, {sql: script, tabName: `migration of ${targetDatabase}`})}
              >
                Open in console
              </button>
            </div>
            <pre className="cmp-sql-preview compare-sql">{chosenStatements ? script : '-- nothing to change'}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
