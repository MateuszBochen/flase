import React, {useMemo, useState} from 'react';
import {ServerStatusInterface} from '../../../Library/Server/ServerInterface';
import {formatRate} from './format';

interface StatusVariablesViewPropsInterface {
  samples: ServerStatusInterface[];
}

/** StatusVariablesView - all status counters with change since previous reading and average per second since start */
export default (props: StatusVariablesViewPropsInterface) => {
  const [filter, setFilter] = useState<string>('');
  const [changedOnly, setChangedOnly] = useState<boolean>(false);
  const last = props.samples[props.samples.length - 1];
  const previous = props.samples[props.samples.length - 2];
  const before = useMemo(() => new Map((previous?.raw || []).map((item) => [item.name, item.value])), [previous]);

  const rows = useMemo(() => {
    const terms = filter.toLowerCase().split(',').map((term) => term.trim()).filter(Boolean);
    return (last?.raw || [])
      .map((item) => {
        const value = Number(item.value);
        const old = Number(before.get(item.name));
        const numeric = item.value !== '' && Number.isFinite(value);
        return {...item, numeric, change: numeric && Number.isFinite(old) && before.has(item.name) ? value - old : null, value: item.value, number: value};
      })
      .filter((item) => (!terms.length || terms.some((term) => item.name.toLowerCase().includes(term))) && (!changedOnly || (item.change !== null && item.change !== 0)));
  }, [last, before, filter, changedOnly]);

  if (!last) {
    return <div className="structure-loading">Loading…</div>;
  }
  return (
    <div className="server-status-variables">
      <div className="server-view-toolbar">
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter (comma = or), e.g. innodb_buffer, com_" aria-label="Filter status" />
        <label className="checkbox">
          <input type="checkbox" checked={changedOnly} onChange={(event) => setChangedOnly(event.target.checked)} />
          Only changing
        </label>
        <span className="server-view-count">{rows.length} / {last.raw.length}</span>
      </div>
      <table className="structure-table server-table">
        <thead><tr><th>Name</th><th className="number">Value</th><th className="number">Change</th><th className="number" title="Average since start of server">Per second</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className="structure-row">
              <td className="name">{row.name}</td>
              <td className="number type">{row.numeric ? row.number.toLocaleString() : row.value}</td>
              <td className={`number ${row.change ? 'changed' : 'muted'}`}>{row.change === null ? '' : `${row.change > 0 ? '+' : ''}${row.change.toLocaleString()}`}</td>
              <td className="number muted">{row.numeric && last.uptime > 0 && row.number > 0 ? formatRate(row.number / last.uptime) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
