import React, {useMemo, useState} from 'react';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import useServerRequest from '../../../Library/Server/useServerRequest';
import CommandType from '../../../Library/WebSocket/Enum/CommandType';
import MessageType from '../../../Library/WebSocket/Enum/MessageType';
import {ServerInfoInterface} from '../../../Library/Server/ServerInterface';
import {formatBytes} from './format';

interface ServerInfoViewPropsInterface {
  connection: ConnectionDataInterface;
  tabId: string;
  dialect: string;
}

/** ServerInfoView - storage engines (access methods), character sets, collations, extensions and databases of server */
export default (props: ServerInfoViewPropsInterface) => {
  const request = useServerRequest<ServerInfoInterface>(props.connection, `${props.tabId}:info`, CommandType.GET_SERVER_INFO, MessageType.SERVER_INFO);
  const [filter, setFilter] = useState<string>('');
  const info = request.data;
  const collations = useMemo(() => (info?.collations || []).filter((collation) => !filter || collation.name.includes(filter.toLowerCase()) || collation.charset.toLowerCase().includes(filter.toLowerCase())), [info, filter]);

  if (request.error) return <div className="structure-error">{request.error}</div>;
  if (!info) return <div className="structure-loading">Loading…</div>;
  const isMysql = props.dialect === 'mysql';

  return (
    <div className="server-info">
      {info.databases && (
        <section className="structure-section">
          <h3>Databases<span className="structure-count">{info.databases.length}</span></h3>
          <table className="structure-table">
            <thead><tr><th>Name</th><th>Encoding</th><th>Collation</th><th>Ctype</th><th className="number">Size</th></tr></thead>
            <tbody>
              {info.databases.map((database) => (
                <tr key={database.name}><td className="name">{database.name}</td><td>{database.encoding}</td><td>{database.collation}</td><td>{database.ctype}</td>
                  <td className="number muted">{database.size === null ? '' : formatBytes(database.size)}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="structure-section">
        <h3>{isMysql ? 'Storage engines' : 'Access methods'}<span className="structure-count">{info.engines.length}</span></h3>
        <table className="structure-table">
          <thead><tr><th>Name</th><th>{isMysql ? 'Support' : 'Type'}</th>{isMysql && <th>Transactions</th>}<th>Comment</th></tr></thead>
          <tbody>
            {info.engines.map((engine) => (
              <tr key={engine.name} className={engine.support === 'NO' || engine.support === 'DISABLED' ? 'muted-row' : ''}>
                <td className="name">{engine.name}</td>
                <td>{engine.support}</td>
                {isMysql && <td>{engine.transactions === null ? '' : engine.transactions ? 'yes' : 'no'}</td>}
                <td>{engine.comment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {info.extensions && (
        <section className="structure-section">
          <h3>Extensions<span className="structure-count">{info.extensions.filter((extension) => extension.installed).length} installed of {info.extensions.length}</span></h3>
          <table className="structure-table">
            <thead><tr><th>Name</th><th>Installed</th><th>Available</th><th>Comment</th></tr></thead>
            <tbody>
              {info.extensions.map((extension) => (
                <tr key={extension.name} className={extension.installed ? '' : 'muted-row'}>
                  <td className="name">{extension.name}</td><td>{extension.installed}</td><td className="muted">{extension.available}</td><td>{extension.comment}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="structure-hint">Install with CREATE EXTENSION name in SQL console of a database.</div>
        </section>
      )}

      {info.charsets && (
        <section className="structure-section">
          <h3>Character sets<span className="structure-count">{info.charsets.length}</span></h3>
          <table className="structure-table">
            <thead><tr><th>Name</th><th>Description</th><th>Default collation</th><th className="number">Max bytes</th></tr></thead>
            <tbody>
              {info.charsets.map((charset) => (
                <tr key={charset.name}><td className="name">{charset.name}</td><td>{charset.description}</td><td className="muted">{charset.defaultCollation}</td><td className="number">{charset.maxLength}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="structure-section">
        <h3>
          Collations<span className="structure-count">{collations.length} / {info.collations.length}</span>
          <input className="server-inline-filter" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter collations…" aria-label="Filter collations" />
        </h3>
        <table className="structure-table">
          <thead><tr><th>Name</th><th>{isMysql ? 'Character set' : 'Encoding'}</th>{isMysql ? <th>Default</th> : <th>Provider</th>}</tr></thead>
          <tbody>
            {collations.map((collation) => (
              <tr key={`${collation.charset}:${collation.name}`}>
                <td className="name">{collation.name}</td><td>{collation.charset}</td>
                <td className="muted">{isMysql ? (collation.isDefault ? 'yes' : '') : collation.provider}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
