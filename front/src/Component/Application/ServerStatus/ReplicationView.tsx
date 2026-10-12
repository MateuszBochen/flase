import React, {useEffect, useRef, useState} from 'react';
import toast from 'react-hot-toast';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faArrowsRotate, faRotate, faPlay, faStop} from '@fortawesome/free-solid-svg-icons';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import useServerRequest, {sendServerCommand} from '../../../Library/Server/useServerRequest';
import CommandType from '../../../Library/WebSocket/Enum/CommandType';
import MessageType from '../../../Library/WebSocket/Enum/MessageType';
import EventBus from '../../../Library/EventBus/EventBus';
import WebsocketReceivedAMessage from '../../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../../Library/WebSocket/Interface/MessageInterface';
import {LogEventsInterface, ReplicationActionType, ReplicationInterface} from '../../../Library/Server/ServerInterface';
import Popup from '../../../UI/Popup/Popup';
import Button from '../../../UI/Button/Button';
import ContextMenu, {ContextMenuItem} from '../../../UI/ContextMenu/ContextMenu';
import {formatBytes} from './format';

interface ReplicationViewPropsInterface {
  connection: ConnectionDataInterface;
  tabId: string;
  readOnly: boolean;
}

const EVENTS_PAGE = 100;

const ACTION_TITLES: {[kind: string]: string} = {
  flushLogs: 'Start new binary log',
  purgeLogs: 'Delete old binary logs',
  startReplica: 'Start replica',
  stopReplica: 'Stop replica',
  switchWal: 'Switch to new WAL file',
  dropSlot: 'Drop replication slot',
};

/** ReplicationView - role of server, replicas / standbys, slots, logical replication, binary logs / WAL files and their events */
export default (props: ReplicationViewPropsInterface) => {
  const request = useServerRequest<ReplicationInterface>(props.connection, `${props.tabId}:replication`, CommandType.GET_REPLICATION, MessageType.REPLICATION);
  const replication = request.data;
  const [events, setEvents] = useState<LogEventsInterface | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{action: ReplicationActionType, statements: string[]} | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [menu, setMenu] = useState<{x: number, y: number, items: ContextMenuItem[]} | null>(null);
  const pending = useRef<ReplicationActionType | null>(null);
  const eventsTabId = `${props.tabId}:events`;
  const actionTabId = `${props.tabId}:replication-action`;

  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.payload?.tabId === eventsTabId) {
        if (message.message === MessageType.LOG_EVENTS) {
          const page = message.payload as LogEventsInterface;
          // next page is added to shown events
          setEvents((previous) => previous && previous.file === page.file && page.offset > 0 ? {...page, events: [...previous.events, ...page.events]} : page);
          setEventsError(null);
        } else if (message.message === MessageType.QUERY_ERROR) {
          setEventsError(message.payload.error);
        }
      }
      if (message.payload?.tabId === actionTabId) {
        switch (message.message) {
          case MessageType.REPLICATION_ACTION_PREVIEW:
            setBusy(false);
            setPreview({action: pending.current!, statements: message.payload.statements});
            break;
          case MessageType.REPLICATION_ACTION_APPLIED:
            setBusy(false);
            setPreview(null);
            toast.success(`${ACTION_TITLES[message.payload.kind] || 'Action'} - done`);
            request.load();
            break;
          case MessageType.QUERY_ERROR:
            setBusy(false);
            break;
        }
      }
    });
    return () => EventBus.unSub(eventId);
  }, [eventsTabId, actionTabId]);

  const action = (value: ReplicationActionType, dryRun: boolean) => {
    pending.current = value;
    setBusy(true);
    sendServerCommand(props.connection, CommandType.REPLICATION_ACTION, {tabId: actionTabId, action: value, dryRun});
  };
  const showEvents = (file: string, offset: number = 0) => {
    if (offset === 0) setEvents(null);
    sendServerCommand(props.connection, CommandType.GET_LOG_EVENTS, {tabId: eventsTabId, file, offset, limit: EVENTS_PAGE});
  };
  const can = (kind: string) => !props.readOnly && !!replication?.actions.includes(kind as any);

  if (request.error && !replication) return <div className="structure-error">{request.error}</div>;
  if (!replication) return <div className="structure-loading">Loading…</div>;

  return (
    <div className="server-replication">
      <div className="server-view-toolbar">
        {can('flushLogs') && <button type="button" onClick={() => action({kind: 'flushLogs'}, true)} title="FLUSH BINARY LOGS"><FontAwesomeIcon icon={faRotate} /> New binary log</button>}
        {can('switchWal') && <button type="button" onClick={() => action({kind: 'switchWal'}, true)} title="pg_switch_wal()"><FontAwesomeIcon icon={faRotate} /> Switch WAL</button>}
        {can('startReplica') && <button type="button" onClick={() => action({kind: 'startReplica'}, true)}><FontAwesomeIcon icon={faPlay} /> Start replica</button>}
        {can('stopReplica') && <button type="button" onClick={() => action({kind: 'stopReplica'}, true)}><FontAwesomeIcon icon={faStop} /> Stop replica</button>}
        <span className="server-spacer" />
        <button type="button" onClick={() => request.load()} aria-label="Reload replication" title="Reload"><FontAwesomeIcon icon={faArrowsRotate} spin={request.loading} /></button>
      </div>
      {replication.warnings.length > 0 && <div className="structure-warning">{replication.warnings.map((warning) => <div key={warning}>{warning}</div>)}</div>}

      <div className="server-cards">
        {replication.summary.map((item) => (
          <div key={item.label} className={`server-card ${item.state ? `state-${item.state}` : ''}`}>
            <div className="server-card-label">{item.label}</div>
            <div className="server-card-value small" title={item.value}>{item.value}</div>
          </div>
        ))}
      </div>

      {replication.tables.map((table) => (
        <section key={table.id} className="structure-section">
          <h3>{table.title}{table.rows.length > 0 && <span className="structure-count">{table.rows.length}</span>}</h3>
          {!table.rows.length ? <div className="structure-empty">{table.empty}</div> : (
            <table className="structure-table server-table">
              <thead><tr>{table.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
              <tbody>
                {table.rows.map((row, index) => (
                  <tr
                    key={index}
                    className="structure-row"
                    onContextMenu={(event) => {
                      const items: ContextMenuItem[] = [];
                      if (table.id === 'slots' && can('dropSlot')) {
                        items.push({label: 'Drop slot…', danger: true, disabled: row[4] === 'yes', onClick: () => action({kind: 'dropSlot', name: String(row[0])}, true)});
                      }
                      if (table.id === 'channels' && row[0] && !props.readOnly) {
                        const channel = row[0] === '(default)' ? undefined : String(row[0]);
                        items.push({label: 'Start replica', onClick: () => action({kind: 'startReplica', channel}, true)});
                        items.push({label: 'Stop replica', onClick: () => action({kind: 'stopReplica', channel}, true)});
                      }
                      items.push({label: 'Copy row', onClick: () => navigator.clipboard?.writeText(row.join('\t')).then(() => toast.success('Copied'))});
                      event.preventDefault();
                      setMenu({x: event.clientX, y: event.clientY, items});
                    }}
                  >
                    {row.map((value, column) => <td key={column} className={column === 0 ? 'name' : ''}>{value === null ? <span className="muted">–</span> : value}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      ))}

      <section className="structure-section">
        <h3>{replication.logsTitle}{replication.logs && <span className="structure-count">{replication.logs.length}</span>}</h3>
        {replication.logsMessage && <div className="structure-empty">{replication.logsMessage}</div>}
        {replication.logs && (
          <table className="structure-table server-table server-logs">
            <thead><tr><th>Name</th><th className="number">Size</th>{replication.logs.some((log) => log.modified) && <th>Modified</th>}</tr></thead>
            <tbody>
              {replication.logs.map((log) => (
                <tr
                  key={log.name}
                  className={`structure-row ${replication.logEvents ? 'editable' : ''} ${events?.file === log.name ? 'selected' : ''}`}
                  onClick={() => replication.logEvents && showEvents(log.name)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({x: event.clientX, y: event.clientY, items: [
                      ...(replication.logEvents ? [{label: 'Show events', onClick: () => showEvents(log.name)}] : []),
                      ...(can('purgeLogs') ? [{label: 'Delete logs before this one…', danger: true, onClick: () => action({kind: 'purgeLogs', to: log.name}, true)}] : []),
                      {label: 'Copy name', onClick: () => navigator.clipboard?.writeText(log.name).then(() => toast.success('Copied'))},
                    ]});
                  }}
                >
                  <td className="name">{log.name}</td>
                  <td className="number">{log.size === null ? '' : formatBytes(log.size)}</td>
                  {replication.logs!.some((item) => item.modified) && <td className="muted">{log.modified}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {replication.logEvents && !events && !eventsError && <div className="structure-hint">Click a log to show its events.</div>}
      </section>

      {(events || eventsError) && (
        <section className="structure-section">
          <h3>Events of {events?.file}<span className="structure-count">{events?.events.length}</span></h3>
          {eventsError && <div className="structure-error">{eventsError}</div>}
          {events && (
            <>
              <table className="structure-table server-table server-events">
                <thead><tr><th className="number">Position</th><th>Type</th><th>Server ID</th><th className="number">End position</th><th>Info</th></tr></thead>
                <tbody>
                  {events.events.map((item) => (
                    <tr key={item.position} className="structure-row">
                      <td className="number muted">{item.position}</td>
                      <td className="name">{item.type}</td>
                      <td className="muted">{item.serverId}</td>
                      <td className="number muted">{item.endPosition}</td>
                      <td className="code">{item.info}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {events.events.length > 0 && events.events.length % EVENTS_PAGE === 0 && (
                <button type="button" className="structure-section-action" onClick={() => showEvents(events.file, events.events.length)}>Load next {EVENTS_PAGE} events</button>
              )}
            </>
          )}
        </section>
      )}

      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}
      {preview && (
        <Popup
          openOnMount
          label={`${ACTION_TITLES[preview.action.kind]} - confirm`}
          onClickOk={() => setPreview(null)}
          onClose={() => setPreview(null)}
          buttons={[
            <Button
              key="execute"
              size="small"
              colorVariant={preview.action.kind === 'purgeLogs' || preview.action.kind === 'dropSlot' ? 'danger' : 'success'}
              label={preview.action.kind === 'purgeLogs' || preview.action.kind === 'dropSlot' ? 'Hold to execute' : 'Execute'}
              loading={busy}
              onClick={() => action(preview.action, false)}
            />,
            <Button key="cancel" size="small" label="Cancel" onClick={() => setPreview(null)} />,
          ]}
        >
          <pre className="cmp-sql-preview">{preview.statements.map((statement) => `${statement};`).join('\n')}</pre>
          {preview.action.kind === 'purgeLogs' && <div className="structure-hint">Logs before {preview.action.to} are deleted - replicas which did not read them yet cannot continue.</div>}
          {preview.action.kind === 'dropSlot' && <div className="structure-hint">Standby or subscriber using the slot cannot continue without it.</div>}
        </Popup>
      )}
    </div>
  );
}
