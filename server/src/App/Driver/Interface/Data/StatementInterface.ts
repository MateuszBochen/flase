import ProcessInterface from './ProcessInterface';

/** result of single statement executed in SQL console */
export type StatementResultType =
  | {kind: 'rows', rows: number, truncated: boolean}
  | {kind: 'ok', affectedRows: number, changedRows: number, insertId: number, warningCount: number, message: string};

export interface ExecuteStatementsRequestInterface {
  tabId?: string;
  /** null - no database selected */
  database: string | null;
  statements: string[];
  /** rows of one result sent to client, the rest is read and dropped */
  maxRows?: number;
  /** default true - remaining statements are not executed after error */
  stopOnError?: boolean;
}

export interface StatementStartedInterface {
  tabId?: string;
  index: number;
  sql: string;
}

export interface StatementFinishedInterface {
  tabId?: string;
  index: number;
  sql: string;
  durationMs: number;
  result?: StatementResultType;
  error?: string;
}

export interface ExecutionFinishedInterface {
  tabId?: string;
  executed: number;
  failed: number;
  /** statements after error which were not executed */
  skipped: number;
}

export interface ProcessListInterface {
  tabId?: string;
  processes: ProcessInterface[];
}
