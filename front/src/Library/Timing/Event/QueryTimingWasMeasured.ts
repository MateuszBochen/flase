import EventInterface from '../../EventBus/EventInterface';
import {QueryTimingInterface} from '../QueryTiming';

class QueryTimingWasMeasured implements EventInterface<{tabId: string, timing: QueryTimingInterface}> {
  constructor(private readonly data: {tabId: string, timing: QueryTimingInterface}) {
  }

  getData(): {tabId: string, timing: QueryTimingInterface} {
    return this.data;
  }
}

export default QueryTimingWasMeasured;
