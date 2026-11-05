import {ServerQueryTimingInterface} from '../../Driver/Interface/Data/QueryFinishedInterface';

type StepType = 'session' | 'metadata' | 'firstRow' | 'lastRow';

/**
 * Times of steps of one query on server - only borders of steps are read (a few calls of clock per query, not per row).
 * @author Mateusz Bochen
 */
class QueryStopwatch {
  private readonly started = process.hrtime.bigint();
  private readonly marks = new Map<StepType, bigint>();

  mark(step: StepType): void {
    if (!this.marks.has(step)) {
      this.marks.set(step, process.hrtime.bigint());
    }
  }

  timing(): ServerQueryTimingInterface {
    const end = process.hrtime.bigint();
    const at = (step: StepType): bigint | undefined => this.marks.get(step);
    const ms = (from: bigint, to: bigint): number => Math.max(0, Number(to - from) / 1e6);
    const session = at('session') ?? this.started;
    const metadata = at('metadata') ?? session;
    const lastRow = at('lastRow') ?? end;
    // without rows the query ended with its last (empty) result
    const firstRow = at('firstRow') ?? lastRow;
    return {
      sessionMs: ms(this.started, session),
      metadataMs: ms(session, metadata),
      executionMs: ms(metadata, firstRow),
      fetchMs: ms(firstRow, lastRow),
      serverMs: ms(this.started, end),
    };
  }
}

export default QueryStopwatch;
