import React, {useCallback, useEffect, useRef, useState} from 'react';
import toast from 'react-hot-toast';
import ApplicationInterface from '../ApplicationInterface';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import EventBus from '../../../Library/EventBus/EventBus';
import WebsocketReceivedAMessage from '../../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../../Library/WebSocket/Interface/MessageInterface';
import MessageType from '../../../Library/WebSocket/Enum/MessageType';
import ConsoleApi from '../../../Library/Console/ConsoleApi';
import ProcessInterface from '../../../Library/Console/ProcessInterface';
import './style.css';
import useConnectionSettings from '../../../Library/Connection/useConnectionSettings';

export interface ProcessListPropsInterface extends ApplicationInterface {
  connection: ConnectionDataInterface;
}

const REFRESH_MS = 2000;

/** ProcessList - threads of database server, running queries can be stopped */
export default (props: ProcessListPropsInterface) => {
  const connection = useConnectionSettings(props.connection);
  const [processes, setProcesses] = useState<ProcessInterface[]>([]);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [hideSleeping, setHideSleeping] = useState<boolean>(true);
  const [filter, setFilter] = useState<string>('');
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
  const tabId = `${props.tabId}:processlist`;
  const api = ConsoleApi.getInstance();
  const waiting = useRef<boolean>(false);

  const load = useCallback(() => {
    // next refresh only after answer - slow server must not get flooded
    if (waiting.current) return;
    waiting.current = true;
    api.processList(props.connection, tabId);
  }, [props.connection, tabId]);

  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.payload?.tabId !== tabId) return;
      if (message.message === MessageType.PROCESSLIST) {
        waiting.current = false;
        setProcesses(message.payload.processes);
        setLoadedAt(Date.now());
      } else if (message.message === MessageType.PROCESS_KILLED) {
        toast.success(message.payload.connection ? `Connection ${message.payload.id} killed` : `Query of ${message.payload.id} stopped`);
        waiting.current = false;
        load();
      } else if (message.message === MessageType.QUERY_ERROR) {
        waiting.current = false;
      }
    });
    load();
    return () => EventBus.unSub(eventId);
  }, [tabId, load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(load, REFRESH_MS);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);

  const kill = (process: ProcessInterface, wholeConnection: boolean) => {
    const what = wholeConnection ? `close connection ${process.id}` : `stop query of ${process.id}`;
    const ownWarning = process.own ? '\n\nThis connection belongs to this application.' : '';
    if (window.confirm(`Really ${what}?\n\n${process.info || process.command}${ownWarning}`)) {
      waiting.current = true;
      api.killProcess(props.connection, tabId, process.id, wholeConnection);
    }
  };

  const visible = processes.filter((process) => {
    if (hideSleeping && process.command === 'Sleep') return false;
    if (!filter) return true;
    const text = `${process.id} ${process.user} ${process.host} ${process.db} ${process.command} ${process.state} ${process.info}`.toLowerCase();
    return text.includes(filter.toLowerCase());
  });

  return (
    <div className="cmp-process-list">
      <div className="process-toolbar">
        <button type="button" onClick={() => { waiting.current = false; load(); }}>Refresh</button>
        <label><input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />Auto refresh</label>
        <label><input type="checkbox" checked={hideSleeping} onChange={(event) => setHideSleeping(event.target.checked)} />Hide sleeping</label>
        <input className="process-filter" value={filter} placeholder="Filter…" onChange={(event) => setFilter(event.target.value)} />
        <span className="process-summary">
          {visible.length} of {processes.length} thread(s){loadedAt ? ` · ${new Date(loadedAt).toLocaleTimeString()}` : ''}
        </span>
      </div>
      <div className="process-table-wrapper">
        <table className="process-table">
          <thead>
            <tr><th>Id</th><th>User</th><th>Host</th><th>Database</th><th>Command</th><th>Time</th><th>State</th><th>Query</th><th /></tr>
          </thead>
          <tbody>
            {visible.map((process) => (
              <tr key={process.id} className={`${process.own ? 'own' : ''} ${process.time >= 10 && process.command === 'Query' ? 'slow' : ''}`}>
                <td className="number">{process.id}</td>
                <td>{process.user}</td>
                <td className="muted">{process.host}</td>
                <td>{process.db}</td>
                <td>{process.command}{process.own && <span className="own-badge" title="Connection of this application">app</span>}</td>
                <td className="number">{process.time}s</td>
                <td className="muted">{process.state}</td>
                <td className="query" title={process.info || ''}>{process.info}</td>
                <td className="actions">
                  {process.command === 'Query' && (
                    <button type="button" title="KILL QUERY - stop the statement" disabled={connection.readOnly} onClick={() => kill(process, false)}>Kill query</button>
                  )}
                  <button type="button" className="danger" title="KILL - close the connection" disabled={connection.readOnly} onClick={() => kill(process, true)}>Kill</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
