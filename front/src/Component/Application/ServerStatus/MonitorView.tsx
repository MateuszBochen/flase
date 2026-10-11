import React from 'react';
import {ServerStatusInterface} from '../../../Library/Server/ServerInterface';
import LineChart, {ChartSeriesInterface} from './LineChart';
import {formatBytes, formatDuration, formatNumber, formatPercent, formatRate} from './format';

interface MonitorViewPropsInterface {
  samples: ServerStatusInterface[];
  dialect: string;
}

const valueOf = (sample: ServerStatusInterface | undefined, key: string): number | null => sample?.metrics.find((metric) => metric.key === key)?.value ?? null;
const has = (sample: ServerStatusInterface | undefined, key: string) => valueOf(sample, key) !== null;

/** rate per second of counter between sample and previous one, null for first sample or restart of server */
const rate = (samples: ServerStatusInterface[], index: number, key: string): number | null => {
  if (index === 0) return null;
  const now = valueOf(samples[index], key);
  const before = valueOf(samples[index - 1], key);
  const seconds = (samples[index].takenAt - samples[index - 1].takenAt) / 1000;
  if (now === null || before === null || seconds <= 0 || now < before) return null;
  return (now - before) / seconds;
};

/** hit ratio of cache between samples */
const hitRatio = (samples: ServerStatusInterface[], index: number): number | null => {
  const requests = rate(samples, index, 'cacheRequests');
  const misses = rate(samples, index, 'cacheMisses');
  if (requests === null || misses === null) return null;
  return requests > 0 ? 1 - misses / requests : null;
};

const COLORS = ['#3574f0', '#5fa84f', '#e5a50a', '#d9534f', '#9b6bdf'];

/** MonitorView - current values of server and live charts of last samples */
export default (props: MonitorViewPropsInterface) => {
  const samples = props.samples;
  const last = samples[samples.length - 1];
  if (!last) {
    return <div className="structure-loading">Loading…</div>;
  }
  const lastIndex = samples.length - 1;
  const times = samples.map((sample) => sample.takenAt);
  const series = (keys: string[], compute: (index: number, key: string) => number | null): ChartSeriesInterface[] => keys
    .filter((key) => has(last, key))
    .map((key, index) => ({
      label: last.metrics.find((metric) => metric.key === key)!.label,
      color: COLORS[index % COLORS.length],
      values: samples.map((sample, sampleIndex) => compute(sampleIndex, key)),
    }));
  const rates = (keys: string[]) => series(keys, (index, key) => rate(samples, index, key));
  const gauges = (keys: string[]) => series(keys, (index, key) => valueOf(samples[index], key));

  const workKey = has(last, 'queries') ? 'queries' : 'transactions';
  const totalRequests = valueOf(last, 'cacheRequests');
  const totalMisses = valueOf(last, 'cacheMisses');
  const totalHitRatio = totalRequests ? 1 - (totalMisses || 0) / totalRequests : null;
  const currentHitRatio = hitRatio(samples, lastIndex);
  const connections = valueOf(last, 'connections') || 0;
  const maxConnections = valueOf(last, 'maxConnections');

  const card = (label: string, value: React.ReactNode, detail?: React.ReactNode, warning?: boolean) => (
    <div className={`server-card ${warning ? 'warning' : ''}`} key={label}>
      <div className="server-card-label">{label}</div>
      <div className="server-card-value">{value}</div>
      {detail && <div className="server-card-detail">{detail}</div>}
    </div>
  );
  const rateText = (key: string) => {
    const value = rate(samples, lastIndex, key);
    return value === null ? '–' : formatRate(value);
  };

  return (
    <div className="server-monitor">
      <div className="server-cards">
        {card('Uptime', formatDuration(last.uptime), `version ${last.version}`)}
        {card(
          'Connections',
          <>{formatNumber(connections)}{maxConnections ? <small> / {formatNumber(maxConnections)}</small> : null}</>,
          `${formatNumber(valueOf(last, 'running') || 0)} running${has(last, 'maxUsedConnections') ? `, max used ${formatNumber(valueOf(last, 'maxUsedConnections')!)}` : ''}`,
          !!maxConnections && connections / maxConnections > 0.8,
        )}
        {card(workKey === 'queries' ? 'Queries / s' : 'Transactions / s', rateText(workKey), `${formatNumber(valueOf(last, workKey) || 0)} since start`)}
        {has(last, 'bytesReceived') && card(
          'Traffic / s',
          <>{rate(samples, lastIndex, 'bytesReceived') === null ? '–' : formatBytes(rate(samples, lastIndex, 'bytesReceived')!)}<small> in</small></>,
          `${rate(samples, lastIndex, 'bytesSent') === null ? '–' : formatBytes(rate(samples, lastIndex, 'bytesSent')!)} out`,
        )}
        {totalHitRatio !== null && card(
          props.dialect === 'mysql' ? 'Buffer pool hit ratio' : 'Cache hit ratio',
          currentHitRatio === null ? formatPercent(totalHitRatio) : formatPercent(currentHitRatio),
          `${formatPercent(totalHitRatio)} since start`,
          totalHitRatio < 0.99 && (totalRequests || 0) > 10000,
        )}
        {has(last, 'slowQueries') && card('Slow queries', formatNumber(valueOf(last, 'slowQueries')!), `${rateText('slowQueries')} / s`, (rate(samples, lastIndex, 'slowQueries') || 0) > 0)}
        {has(last, 'deadlocks') && card('Deadlocks', formatNumber(valueOf(last, 'deadlocks')!), `${rateText('deadlocks')} / s`, (rate(samples, lastIndex, 'deadlocks') || 0) > 0)}
        {has(last, 'idleInTransaction') && card('Idle in transaction', formatNumber(valueOf(last, 'idleInTransaction')!), `${formatNumber(valueOf(last, 'waitingForLock') || 0)} waiting for lock`,
          (valueOf(last, 'idleInTransaction') || 0) > 0)}
        {has(last, 'tempBytes') && card('Temporary files', formatBytes(valueOf(last, 'tempBytes')!), 'since statistics reset')}
        {has(last, 'tmpDiskTables') && card('Temporary tables on disk', formatNumber(valueOf(last, 'tmpDiskTables')!), `${rateText('tmpDiskTables')} / s`)}
      </div>

      <div className="server-charts">
        <LineChart title={workKey === 'queries' ? 'Queries per second' : 'Transactions per second'} times={times} series={rates([workKey, 'commits', 'rollbacks'].filter((key, index) => index === 0 || workKey === 'transactions'))} format={formatRate} />
        <LineChart title="Connections" times={times} series={gauges(['connections', 'running', 'idleInTransaction'])} format={(value) => formatNumber(value)} />
        <LineChart title={props.dialect === 'mysql' ? 'Statements per second' : 'Rows per second'} times={times} series={rates(['select', 'insert', 'update', 'delete'])} format={formatRate} />
        {has(last, 'bytesReceived') && <LineChart title="Traffic per second" times={times} series={rates(['bytesReceived', 'bytesSent'])} format={formatBytes} />}
        {totalHitRatio !== null && (
          <LineChart
            title={props.dialect === 'mysql' ? 'Buffer pool hit ratio' : 'Cache hit ratio'}
            times={times}
            series={[{label: 'hit ratio', color: COLORS[1], values: samples.map((sample, index) => {
              const ratio = hitRatio(samples, index);
              return ratio === null ? null : ratio * 100;
            })}]}
            format={(value) => `${formatNumber(value, 2)} %`}
            max={100}
          />
        )}
      </div>
    </div>
  );
}
