import {ServerQueryTimingInterface} from '../Record/Interface/QueryFinishedInterface';
import EventBus from '../EventBus/EventBus';
import MessageType from '../WebSocket/Enum/MessageType';
import QueryTimingWasMeasured from './Event/QueryTimingWasMeasured';

/** steps of query from request in browser to painted rows, milliseconds */
export interface QueryTimingInterface {
  totalMs: number;
  /** steps measured by server, null for server without timing */
  server: ServerQueryTimingInterface | null;
  /** time between browser and Flase server - total of browser minus work of server */
  networkMs: number | null;
  /** last rows received -> rows painted */
  renderMs: number;
  rows: number;
  /** size of received messages of the query (characters of JSON) */
  bytes: number;
}

type PendingType = {
  startedAt: number;
  bytes: number;
  finishedAt?: number;
  /** result shown later than received (hidden tab of console) - render is measured from here */
  shownAt?: number;
  rows?: number;
  server?: ServerQueryTimingInterface;
};

/**
 * Times of queries of tabs (grid, results of console) - only borders of steps are read, nothing per row.
 * start (request sent) -> received (messages, from websocket client) -> rendered (view painted rows).
 */
class QueryTiming {
  private static readonly pending = new Map<string, PendingType>();
  private static readonly measured = new Map<string, QueryTimingInterface>();

  /** request of the tab was sent */
  static start(tabId: string): void {
    QueryTiming.pending.set(tabId, {startedAt: performance.now(), bytes: 0});
  }

  /** every message of websocket - size is length of its text */
  static received(message: {message: string, payload?: any}, size: number): void {
    const tabId: string | undefined = message.payload?.tabId;
    if (!tabId) return;
    // console: statement N starts on server, its rows have tab `${run}:${N}` (the first one was started with the run)
    if (message.message === MessageType.STATEMENT_STARTED && message.payload.index > 0) {
      QueryTiming.start(`${tabId}:${message.payload.index}`);
      return;
    }
    const pending = QueryTiming.pending.get(tabId);
    if (!pending) return;
    pending.bytes += size;
    if (message.message === MessageType.QUERY_FINISHED) {
      pending.finishedAt = performance.now();
      pending.rows = message.payload.rows;
      pending.server = message.payload.timing;
    } else if (message.message === MessageType.QUERY_ERROR) {
      QueryTiming.pending.delete(tabId);
    }
  }

  /** received result is shown only now (tab of console result opened later) */
  static shown(tabId: string): void {
    const pending = QueryTiming.pending.get(tabId);
    if (pending?.finishedAt !== undefined) pending.shownAt = performance.now();
  }

  /** view committed all rows of the tab - paint is in the frame after the next one */
  static rendered(tabId: string): void {
    const pending = QueryTiming.pending.get(tabId);
    if (!pending || pending.finishedAt === undefined) return;
    QueryTiming.pending.delete(tabId);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const paintedAt = performance.now();
      const receivedMs = pending.finishedAt! - pending.startedAt;
      const renderMs = paintedAt - Math.max(pending.finishedAt!, pending.shownAt ?? 0);
      const timing: QueryTimingInterface = {
        totalMs: receivedMs + renderMs,
        server: pending.server || null,
        networkMs: pending.server ? Math.max(0, receivedMs - pending.server.serverMs) : null,
        renderMs,
        rows: pending.rows ?? 0,
        bytes: pending.bytes,
      };
      QueryTiming.measured.set(tabId, timing);
      EventBus.emit(new QueryTimingWasMeasured({tabId, timing}));
    }));
  }

  static last(tabId: string): QueryTimingInterface | undefined {
    return QueryTiming.measured.get(tabId);
  }
}

export default QueryTiming;
