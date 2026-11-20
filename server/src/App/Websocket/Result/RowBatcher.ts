import ClientWebSocket from '../ClientWebSocket';
import RecordType from '../../../Driver/Type/Data/RecordType';

/** rows of one message - one message per row costs JSON, websocket frame and client dispatch for each row */
const BATCH_ROWS = 200;
/** slow query - rows read so far are shown, not held until batch is full */
const FLUSH_MS = 25;
/** client reads slower than database sends - reading of rows waits, server does not buffer whole result */
const HIGH_WATER_BYTES = 4 * 1024 * 1024;
const LOW_WATER_BYTES = 1024 * 1024;

/**
 * Collects rows of result and sends them in batches. add() returns promise while send buffer is full -
 * session stops reading rows until it resolves. flush() must be called before message which ends the result.
 */
class RowBatcher {
  private rows: RecordType[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private draining: Promise<void> | null = null;

  constructor(
    private readonly socket: ClientWebSocket,
    private readonly send: (rows: RecordType[]) => void,
  ) {
  }

  add = (row: RecordType): void | Promise<void> => {
    this.rows.push(row);
    if (this.rows.length >= BATCH_ROWS) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(this.flush, FLUSH_MS);
    }
    return this.draining ?? undefined;
  }

  flush = (): void => {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (!this.rows.length) {
      return;
    }
    const rows = this.rows;
    this.rows = [];
    this.send(rows);
    if (!this.draining && this.socket.bufferedAmount() > HIGH_WATER_BYTES) {
      this.draining = this.socket.whenDrained(LOW_WATER_BYTES).finally(() => {
        this.draining = null;
      });
    }
  }
}

export default RowBatcher;
