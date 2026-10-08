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
import {DumpFinishedInterface} from '../../../Library/Transfer/TransferInterface';
import {formatBytes} from '../../../Library/Record/BinaryValue';

interface ExportPanelPropsInterface {
  connection: ConnectionDataInterface;
  database: string;
  /** only this table is selected at start */
  table?: string;
  tabId: string;
}

/** ExportPanel - SQL dump of database or selected tables */
export default (props: ExportPanelPropsInterface) => {
  const tableManager = TableManager.getInstance();
  const listTables = () => tableManager.getTablesListForDatabase(props.connection, {name: props.database}).map((table) => table.tableName).sort();
  const [tables, setTables] = useState<string[]>(listTables());
  const [selected, setSelected] = useState<Set<string>>(new Set(props.table ? [props.table] : listTables()));
  const [structure, setStructure] = useState<boolean>(true);
  const [data, setData] = useState<boolean>(true);
  const [dropTables, setDropTables] = useState<boolean>(true);
  const [createDatabase, setCreateDatabase] = useState<boolean>(false);
  const [views, setViews] = useState<boolean>(true);
  const [triggers, setTriggers] = useState<boolean>(true);
  const [gzip, setGzip] = useState<boolean>(false);
  const [running, setRunning] = useState<boolean>(false);
  const [result, setResult] = useState<DumpFinishedInterface | null>(null);
  const exportTabId = `${props.tabId}:export`;
  /** user changed selection - reloaded table list must not change it */
  const touched = useRef<boolean>(!!props.table);

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
      if (message.payload?.tabId === exportTabId && message.message === MessageType.DUMP_FINISHED) {
        setRunning(false);
        setResult(message.payload);
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

  const start = async () => {
    setRunning(true);
    setResult(null);
    try {
      const chosen = tables.filter((name) => selected.has(name));
      const ticket = await TransferApi.requestTicket(props.connection, exportTabId, {
        kind: 'dump',
        // all tables - also tables created later than the list was loaded
        options: {database: props.database, tables: allSelected && !props.table ? [] : chosen, structure, data, dropTables, createDatabase, views, triggers},
        gzip,
      });
      TransferApi.download(ticket);
    } catch (e: any) {
      setRunning(false);
      toast.error(e?.message || String(e));
    }
  };

  return (
    <section className="transfer-panel">
      <h3>Export (SQL dump)</h3>
      <div className="transfer-columns">
        <div className="transfer-tables">
          <label className="transfer-check select-all">
            <input type="checkbox" checked={allSelected} onChange={() => { touched.current = true; setSelected(allSelected ? new Set() : new Set(tables)); }} />
            All tables and views ({selected.size} / {tables.length})
          </label>
          <div className="transfer-table-list">
            {tables.map((name) => (
              <label key={name} className="transfer-check">
                <input type="checkbox" checked={selected.has(name)} onChange={() => toggle(name)} />{name}
              </label>
            ))}
          </div>
        </div>
        <div className="transfer-options">
          <label className="transfer-check"><input type="checkbox" checked={structure} onChange={(e) => setStructure(e.target.checked)} />Structure (CREATE TABLE)</label>
          <label className="transfer-check"><input type="checkbox" checked={data} onChange={(e) => setData(e.target.checked)} />Data (INSERT)</label>
          <label className="transfer-check"><input type="checkbox" checked={dropTables} disabled={!structure} onChange={(e) => setDropTables(e.target.checked)} />DROP before CREATE</label>
          <label className="transfer-check"><input type="checkbox" checked={views} disabled={!structure} onChange={(e) => setViews(e.target.checked)} />Views</label>
          <label className="transfer-check"><input type="checkbox" checked={triggers} disabled={!structure} onChange={(e) => setTriggers(e.target.checked)} />Triggers</label>
          <label className="transfer-check"><input type="checkbox" checked={createDatabase} onChange={(e) => setCreateDatabase(e.target.checked)} />CREATE DATABASE + USE</label>
          <label className="transfer-check"><input type="checkbox" checked={gzip} onChange={(e) => setGzip(e.target.checked)} />Compress (.sql.gz)</label>
          <button
            type="button"
            className="transfer-start"
            disabled={running || !selected.size || (!structure && !data)}
            onClick={start}
          >
            {running ? 'Exporting…' : 'Download dump'}
          </button>
          {result && !result.error && (
            <div className="transfer-result">{result.tables} table(s), {result.rows.toLocaleString()} row(s), {formatBytes(result.bytes)}{gzip ? ' before compression' : ''}</div>
          )}
          {result?.error && <div className="transfer-error">{result.error}</div>}
          <div className="transfer-hint">Data are read in one transaction (consistent snapshot of InnoDB tables). DEFINER of views and triggers is left out.</div>
        </div>
      </div>
    </section>
  );
}
