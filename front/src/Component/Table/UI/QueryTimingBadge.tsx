import React, {useEffect, useState} from 'react';
import Icon from '../../../UI/Icon/Icon';
import {faStopwatch} from '@fortawesome/free-solid-svg-icons';
import EventBus from '../../../Library/EventBus/EventBus';
import QueryTiming, {QueryTimingInterface} from '../../../Library/Timing/QueryTiming';
import QueryTimingWasMeasured from '../../../Library/Timing/Event/QueryTimingWasMeasured';
import {formatBytes} from '../../../Library/Record/BinaryValue';

/** 12,345 - toLocaleString initialises Intl (about 10 ms on first use, measured) */
const formatCount = (count: number): string => String(count).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const formatMs = (ms: number): string => ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`;

type StepType = {label: string, ms: number, hint: string};

/** steps in order of the query - server steps, then network (both ways) and render in browser */
const stepsOf = (timing: QueryTimingInterface): StepType[] => {
  const steps: StepType[] = [];
  const server = timing.server;
  if (server) {
    steps.push({label: 'Connection', ms: server.sessionMs, hint: 'Free connection of the pool, new session'});
    steps.push({label: 'Metadata', ms: server.metadataMs, hint: 'Structure of tables of the query (types, keys, references)'});
    if (server.countMs !== null) steps.push({label: 'Count', ms: server.countMs, hint: 'COUNT of all rows for paging, before the query'});
    steps.push({label: 'Execution', ms: server.executionMs, hint: 'Database until the first row (with network to the database)'});
    steps.push({label: `Fetch ${formatCount(timing.rows)} row(s)`, ms: server.fetchMs, hint: 'From the first to the last row - reading and sending'});
  }
  if (timing.networkMs !== null) steps.push({label: `Network · ${formatBytes(timing.bytes)}`, ms: timing.networkMs, hint: 'Browser <-> Flase server, both ways'});
  steps.push({label: 'Render', ms: timing.renderMs, hint: 'Last rows received -> rows painted'});
  return steps;
};

/** QueryTimingBadge - total time of the last query of the tab, steps on hover */
export default ({tabId}: {tabId?: string}) => {
  const [timing, setTiming] = useState<QueryTimingInterface | undefined>(() => tabId ? QueryTiming.last(tabId) : undefined);

  useEffect(() => {
    if (!tabId) return undefined;
    setTiming(QueryTiming.last(tabId));
    const eventId = EventBus.subscribe<{tabId: string, timing: QueryTimingInterface}>(QueryTimingWasMeasured.name, (event) => {
      if (event.getData().tabId === tabId) setTiming(event.getData().timing);
    });
    return () => EventBus.unSub(eventId);
  }, [tabId]);

  if (!timing) return null;
  const steps = stepsOf(timing);
  let offset = 0;
  return (
    <span className="query-timing" tabIndex={0} aria-label={`Query took ${formatMs(timing.totalMs)}`}>
      <Icon icon={faStopwatch} />
      <span className="query-timing-total">{formatMs(timing.totalMs)}</span>
      <span className="query-timing-panel" role="tooltip">
        <span className="query-timing-title">
          <span>Query</span><span>{formatMs(timing.totalMs)}</span>
        </span>
        {steps.map((step) => {
          const left = timing.totalMs > 0 ? offset / timing.totalMs * 100 : 0;
          const width = timing.totalMs > 0 ? step.ms / timing.totalMs * 100 : 0;
          offset += step.ms;
          return (
            <span className="query-timing-step" key={step.label} title={step.hint}>
              <span className="query-timing-label">{step.label}</span>
              <span className="query-timing-bar"><span style={{left: `${left}%`, width: `max(${width}%, 2px)`}} /></span>
              <span className="query-timing-ms">{formatMs(step.ms)}</span>
            </span>
          );
        })}
        <span className="query-timing-note">Execution includes network between Flase server and database.</span>
      </span>
    </span>
  );
};
