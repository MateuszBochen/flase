import React, {useEffect, useRef, useState} from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faGauge, faPause, faPlay} from '@fortawesome/free-solid-svg-icons';
import ApplicationInterface from '../ApplicationInterface';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import useConnectionSettings from '../../../Library/Connection/useConnectionSettings';
import DriverFactory from '../../../Library/Database/Driver/DriverFactory';
import useServerRequest from '../../../Library/Server/useServerRequest';
import CommandType from '../../../Library/WebSocket/Enum/CommandType';
import MessageType from '../../../Library/WebSocket/Enum/MessageType';
import {ServerStatusInterface} from '../../../Library/Server/ServerInterface';
import TabState from '../../../Library/Tabs/TabState';
import MonitorView from './MonitorView';
import StatusVariablesView from './StatusVariablesView';
import VariablesView from './VariablesView';
import AdvisorView from './AdvisorView';
import ServerInfoView from './ServerInfoView';
import {formatDuration} from './format';
import '../TableRecords/Structure/style.css';
import './style.css';

export interface ServerStatusPropsInterface extends ApplicationInterface {
  connection: ConnectionDataInterface;
}

type ViewType = 'monitor' | 'status' | 'variables' | 'advisor' | 'info';

const VIEWS: {view: ViewType, label: string}[] = [
  {view: 'monitor', label: 'Monitor'},
  {view: 'status', label: 'Status variables'},
  {view: 'variables', label: 'Variables'},
  {view: 'advisor', label: 'Advisor'},
  {view: 'info', label: 'Charsets & engines'},
];

/** samples kept for charts */
const SAMPLES = 120;
const INTERVALS = [1000, 2000, 5000, 10000];

/** ServerStatus - live monitor, status counters, variables (with change), advisor, character sets and engines of server */
const ServerStatus = (props: ServerStatusPropsInterface) => {
  const connection = useConnectionSettings(props.connection);
  const driver = DriverFactory.getDriver(props.connection);
  const tabId = props.tabId || `server:${props.connection.id}`;
  const [view, setView] = useState<ViewType>(() => (TabState.get(tabId).view as ViewType) || 'monitor');
  /** views are mounted when shown first time and stay mounted */
  const [visited, setVisited] = useState<Set<ViewType>>(() => new Set([view]));
  const [interval, setIntervalMs] = useState<number>(2000);
  const [paused, setPaused] = useState<boolean>(false);
  const [samples, setSamples] = useState<ServerStatusInterface[]>([]);
  const [editRequest, setEditRequest] = useState<{name: string, at: number} | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  /** time of last reading request - lost answer must not stop the monitor */
  const sentAt = useRef<number>(0);

  const status = useServerRequest<ServerStatusInterface>(props.connection, `${tabId}:status`, CommandType.GET_SERVER_STATUS, MessageType.SERVER_STATUS, {
    onData: (sample) => setSamples((previous) => [...previous, sample].slice(-SAMPLES)),
  });

  // live readings - not while tab is hidden or page is in background
  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      const visible = !!rootRef.current && rootRef.current.offsetParent !== null && document.visibilityState === 'visible';
      if (visible && (!status.loading || Date.now() - sentAt.current > 10000)) {
        sentAt.current = Date.now();
        status.load();
      }
    }, interval);
    return () => clearInterval(timer);
  }, [interval, paused, status.load, status.loading]);

  const show = (next: ViewType) => {
    setView(next);
    setVisited((previous) => new Set(previous).add(next));
    TabState.update(tabId, {view: next});
  };

  const last = samples[samples.length - 1];

  return (
    <div className="cmp-server-status cmp-structure-view" ref={rootRef}>
      <div className="server-toolbar">
        <span className="server-title"><FontAwesomeIcon icon={faGauge} /> {props.connection.displayName}</span>
        {last && <span className="server-chip" title="Version and uptime">{last.version} · up {formatDuration(last.uptime)}</span>}
        <nav className="server-views" role="tablist">
          {VIEWS.map((item) => (
            <button key={item.view} type="button" role="tab" aria-selected={view === item.view} className={view === item.view ? 'active' : ''} onClick={() => show(item.view)}>
              {item.label}
            </button>
          ))}
        </nav>
        <span className="server-spacer" />
        <select value={interval} onChange={(event) => setIntervalMs(Number(event.target.value))} title="Refresh interval of monitor" aria-label="Refresh interval">
          {INTERVALS.map((ms) => <option key={ms} value={ms}>every {ms / 1000} s</option>)}
        </select>
        <button type="button" onClick={() => setPaused(!paused)} title={paused ? 'Resume live readings' : 'Pause live readings'} aria-label={paused ? 'Resume' : 'Pause'}>
          <FontAwesomeIcon icon={paused ? faPlay : faPause} />
        </button>
      </div>
      {status.error && <div className="structure-error">{status.error}</div>}

      <div className="structure-content">
        {visited.has('monitor') && <div style={{display: view === 'monitor' ? undefined : 'none'}}><MonitorView samples={samples} dialect={driver.dialect} /></div>}
        {visited.has('status') && <div style={{display: view === 'status' ? undefined : 'none'}}><StatusVariablesView samples={samples} /></div>}
        {visited.has('variables') && (
          <div style={{display: view === 'variables' ? undefined : 'none'}}>
            <VariablesView connection={props.connection} tabId={tabId} readOnly={!!connection.readOnly} editRequest={editRequest} />
          </div>
        )}
        {visited.has('advisor') && (
          <div style={{display: view === 'advisor' ? undefined : 'none'}}>
            <AdvisorView
              connection={props.connection}
              tabId={tabId}
              readOnly={!!connection.readOnly}
              onEditVariable={(name) => {
                setEditRequest({name, at: Date.now()});
                show('variables');
              }}
            />
          </div>
        )}
        {visited.has('info') && <div style={{display: view === 'info' ? undefined : 'none'}}><ServerInfoView connection={props.connection} tabId={tabId} dialect={driver.dialect} /></div>}
      </div>
    </div>
  );
};

export default ServerStatus;
