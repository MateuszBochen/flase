import React, {useEffect, useState} from 'react';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faPlay, faXmark} from '@fortawesome/free-solid-svg-icons';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import QueryStore, {HistoryEntryType, SavedQueryType} from '../../../Library/Console/QueryStore';

interface QueryLibraryPropsInterface {
  connection: ConnectionDataInterface;
  onInsert: (sql: string) => void;
  onRun: (sql: string) => void;
}

const timeAgo = (time: number): string => {
  const seconds = Math.round((Date.now() - time) / 1000);
  if (seconds < 60) return 'now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return new Date(time).toLocaleDateString();
};

/** QueryLibrary - history of executed statements and saved queries of connection */
export default (props: QueryLibraryPropsInterface) => {
  const store = QueryStore.getInstance();
  const [panel, setPanel] = useState<'history' | 'saved'>('history');
  const [filter, setFilter] = useState<string>('');
  const [history, setHistory] = useState<HistoryEntryType[]>(store.getHistory(props.connection.id));
  const [saved, setSaved] = useState<SavedQueryType[]>(store.getSaved(props.connection.id));

  useEffect(() => store.subscribe(() => {
    setHistory(store.getHistory(props.connection.id));
    setSaved(store.getSaved(props.connection.id));
  }), [props.connection.id]);

  const matches = (text: string) => !filter || text.toLowerCase().includes(filter.toLowerCase());

  return (
    <div className="cmp-query-library">
      <div className="library-tabs" role="tablist">
        <button type="button" role="tab" className={panel === 'history' ? 'active' : ''} onClick={() => setPanel('history')}>History</button>
        <button type="button" role="tab" className={panel === 'saved' ? 'active' : ''} onClick={() => setPanel('saved')}>Saved ({saved.length})</button>
      </div>
      <input className="library-filter" value={filter} placeholder="Filter…" onChange={(event) => setFilter(event.target.value)} />
      <div className="library-list">
        {panel === 'history' && history.filter((entry) => matches(entry.sql)).map((entry) => (
          <div key={`${entry.executedAt}-${entry.sql}`} className={`library-item ${entry.error ? 'failed' : ''}`} title={entry.error || entry.sql}>
            <div className="library-sql" onClick={() => props.onInsert(entry.sql)}>{entry.sql}</div>
            <div className="library-meta">
              <span>{entry.database || '—'}</span>
              <span>{timeAgo(entry.executedAt)}{entry.durationMs >= 0 ? ` · ${entry.durationMs} ms` : ''}</span>
              <button type="button" title="Run" onClick={() => props.onRun(entry.sql)}><FontAwesomeIcon icon={faPlay} /></button>
            </div>
          </div>
        ))}
        {panel === 'history' && history.length > 0 && (
          <button type="button" className="library-clear" onClick={() => window.confirm('Clear history of this connection?') && store.clearHistory(props.connection.id)}>
            Clear history
          </button>
        )}
        {panel === 'saved' && saved.filter((query) => matches(query.name) || matches(query.sql)).map((query) => (
          <div key={query.id} className="library-item" title={query.sql}>
            <div className="library-name" onClick={() => props.onInsert(query.sql)}>{query.name}</div>
            <div className="library-sql" onClick={() => props.onInsert(query.sql)}>{query.sql}</div>
            <div className="library-meta">
              <span>{query.database || '—'}</span>
              <button type="button" title="Run" onClick={() => props.onRun(query.sql)}><FontAwesomeIcon icon={faPlay} /></button>
              <button type="button" title="Delete" onClick={() => store.removeSaved(props.connection.id, query.id)}><FontAwesomeIcon icon={faXmark} /></button>
            </div>
          </div>
        ))}
        {((panel === 'history' && !history.length) || (panel === 'saved' && !saved.length)) && (
          <div className="library-empty">{panel === 'history' ? 'Executed statements appear here' : 'Save query with Save… button'}</div>
        )}
      </div>
    </div>
  );
}
