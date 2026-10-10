import ColumnInterface from '../Table/Interface/ColumnInterface';
import {SingleRowType} from '../../Component/Table/Interface/RecordsViewPropsInterface';

export type ResultBufferEventType =
  | {type: 'columns', columns: ColumnInterface[], readOnlyReason?: string}
  | {type: 'row', row: SingleRowType}
  | {type: 'finished', rows: number};

/**
 * Rows of one statement result. Messages can come before the result view is shown,
 * the view reads what is buffered and then listens for the rest.
 */
class ResultBuffer {
  columns: ColumnInterface[] | null = null;
  readOnlyReason?: string;
  rows: SingleRowType[] = [];
  finished: number | null = null;
  private readonly listeners = new Set<(event: ResultBufferEventType) => void>();

  push(event: ResultBufferEventType): void {
    if (event.type === 'columns') {
      this.columns = event.columns;
      this.readOnlyReason = event.readOnlyReason;
    } else if (event.type === 'row') {
      this.rows.push(event.row);
    } else {
      this.finished = event.rows;
    }
    this.listeners.forEach((listener) => listener(event));
  }

  subscribe(listener: (event: ResultBufferEventType) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export default ResultBuffer;
