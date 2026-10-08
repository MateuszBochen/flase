import React, {FormEvent, useEffect, useRef, useState} from 'react';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import Database from '../../../Library/Database/Interface/Database';
import ApplicationInterface from '../ApplicationInterface';
import EventBus from '../../../Library/EventBus/EventBus';
import WebsocketReceivedAMessage from '../../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../../Library/WebSocket/Interface/MessageInterface';
import MessageType from '../../../Library/WebSocket/Enum/MessageType';
import DatabaseManger from '../../../Library/Database/DatabaseManger';
import DriverFactory from '../../../Library/Database/Driver/DriverFactory';
import {
  DatabaseSearchFinishedInterface,
  DatabaseSearchResultInterface,
  SearchModeType,
} from '../../../Library/Database/Interface/DatabaseSearchInterface';
import openTableTab from '../TableRecords/openTableTab';
import './style.css';

export interface DatabaseSearchPropsInterface extends ApplicationInterface {
  connection: ConnectionDataInterface;
  database: Database;
}

/** DatabaseSearch - value in all tables of database, like "Search" of phpMyAdmin */
export default (props: DatabaseSearchPropsInterface) => {
  const [term, setTerm] = useState<string>('');
  const [mode, setMode] = useState<SearchModeType>('contains');
  const [results, setResults] = useState<DatabaseSearchResultInterface[]>([]);
  const [finished, setFinished] = useState<DatabaseSearchFinishedInterface | null>(null);
  const [searching, setSearching] = useState<boolean>(false);
  /** term and mode of running search - used when result is opened */
  const searched = useRef<{term: string, mode: SearchModeType}>({term: '', mode: 'contains'});
  const searchId = useRef<number>(0);
  const tabId = () => `${props.tabId}:search:${searchId.current}`;

  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.payload?.tabId !== tabId()) {
        return;
      }
      if (message.message === MessageType.DATABASE_SEARCH_RESULT) {
        setResults((previous) => [...previous, message.payload as DatabaseSearchResultInterface]);
      } else if (message.message === MessageType.DATABASE_SEARCH_FINISHED) {
        setFinished(message.payload as DatabaseSearchFinishedInterface);
        setSearching(false);
      } else if (message.message === MessageType.QUERY_ERROR) {
        setSearching(false);
      }
    });
    return () => EventBus.unSub(eventId);
  }, [props.tabId]);

  const search = (event?: FormEvent) => {
    event?.preventDefault();
    if (!term.length) return;
    // answers of previous search are ignored
    searchId.current++;
    searched.current = {term, mode};
    setResults([]);
    setFinished(null);
    setSearching(true);
    DatabaseManger.getInstance().searchDatabase(props.connection, {tabId: tabId(), database: props.database, term, mode});
  };

  const open = (result: DatabaseSearchResultInterface, columns: DatabaseSearchResultInterface['columns'], newTab: boolean) => {
    const table = {databaseName: props.database.name, name: result.table};
    const query = DriverFactory.getDriver(props.connection)
      .getSearchQuery(table, props.database.name, columns, searched.current.term, searched.current.mode);
    openTableTab(props.connection, table, {query, newTab});
  };

  const totalRows = results.reduce((sum, result) => sum + result.rows, 0);

  return (
    <div className="cmp-database-search">
      <form className="search-form" onSubmit={search}>
        <span className="search-database">{props.database.name}</span>
        <input
          className="search-term"
          value={term}
          autoFocus
          placeholder="Search in all tables…"
          onChange={(event) => setTerm(event.target.value)}
        />
        <select value={mode} onChange={(event) => setMode(event.target.value as SearchModeType)}>
          <option value="contains">contains</option>
          <option value="exact">exact value</option>
        </select>
        <button type="submit" disabled={!term.length || searching}>{searching ? 'Searching…' : 'Search'}</button>
      </form>

      <div className="search-summary">
        {searching && `Found in ${results.length} table(s) so far…`}
        {finished && `${totalRows.toLocaleString()} row(s) in ${finished.tablesWithMatches} of ${finished.tables} table(s)`}
      </div>
      {finished && finished.warnings.length > 0 && (
        <div className="search-warning">{finished.warnings.map((warning) => <div key={warning}>{warning}</div>)}</div>
      )}

      {results.length > 0 && (
        <table className="search-results">
          <thead><tr><th>Table</th><th>Rows</th><th>Columns</th></tr></thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.table}>
                <td>
                  <button
                    type="button"
                    className="search-link"
                    title="Open matching rows (middle click / Ctrl+click - new tab)"
                    onMouseDown={(event) => event.button === 1 && (event.preventDefault(), open(result, result.columns, true))}
                    onClick={(event) => open(result, result.columns, event.ctrlKey || event.metaKey)}
                  >
                    {result.table}
                  </button>
                </td>
                <td className="rows">{result.rows.toLocaleString()}</td>
                <td>
                  {result.columns.map((column) => (
                    <button
                      key={column.name}
                      type="button"
                      className="search-column"
                      title={`Open rows matching in ${column.name}`}
                      onClick={(event) => open(result, [column], event.ctrlKey || event.metaKey)}
                    >
                      {column.name} <span>{column.rows.toLocaleString()}</span>
                    </button>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {finished && results.length === 0 && <div className="search-empty">Nothing found</div>}
    </div>
  );
}
