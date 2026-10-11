/** status, variables, character sets and engines of database server */

export interface ServerMetricInterface {
  /** the same keys in MySQL and PostgreSQL where meaning is the same - connections, running, commits... */
  key: string;
  label: string;
  value: number | null;
  /** counter grows since start of server (client shows rate per second), gauge is current value */
  kind: 'counter' | 'gauge';
  unit: 'bytes' | 'seconds' | null;
}

export interface AdviceInterface {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  /** what was measured */
  detail: string;
  recommendation: string;
  /** variable to change - client offers its edit */
  variable?: string;
}

export interface ServerStatusInterface {
  tabId?: string;
  version: string;
  /** seconds since start of server */
  uptime: number;
  /** time of reading (ms) - rates are computed from difference of two readings */
  takenAt: number;
  metrics: ServerMetricInterface[];
  /** all status variables (SHOW GLOBAL STATUS, pg_stat_*) */
  raw: {name: string, value: string}[];
  /** only when asked for */
  advice?: AdviceInterface[];
}

export interface ServerVariableInterface {
  name: string;
  value: string;
  /** value with unit as shown by server (PostgreSQL 128MB), null when the same as value */
  display: string | null;
  unit: string | null;
  category: string | null;
  description: string | null;
  defaultValue: string | null;
  /** COMPILED, PERSISTED, configuration file... */
  source: string | null;
  /** null - server does not say (MySQL), change may fail */
  editable: boolean | null;
  /** new value is used after restart of server */
  needsRestart: boolean;
  /** value was changed and waits for restart */
  pendingRestart: boolean;
  /** values of enum / boolean variable */
  options: string[] | null;
}

export interface ServerVariablesInterface {
  tabId?: string;
  variables: ServerVariableInterface[];
  /** SET PERSIST of MySQL 8 - value survives restart */
  supportsPersist: boolean;
  /** ALTER SYSTEM of PostgreSQL - every change survives restart */
  persistentChanges: boolean;
}

export interface ServerInfoInterface {
  tabId?: string;
  charsets: {name: string, description: string, defaultCollation: string, maxLength: number}[] | null;
  collations: {name: string, charset: string, isDefault: boolean, provider: string | null}[];
  engines: {name: string, support: string, comment: string, transactions: boolean | null}[];
  /** PostgreSQL */
  extensions: {name: string, installed: string | null, available: string | null, comment: string}[] | null;
  /** databases of PostgreSQL server with encoding and locale */
  databases: {name: string, encoding: string, collation: string, ctype: string, size: number | null}[] | null;
}

export interface SetVariableRequestInterface {
  tabId?: string;
  name: string;
  /** null - back to default (SET GLOBAL x = DEFAULT, ALTER SYSTEM RESET) */
  value: string | null;
  /** SET PERSIST of MySQL 8 */
  persist?: boolean;
  dryRun: boolean;
}

export interface SetVariableResultInterface {
  tabId?: string;
  name: string;
  statements: string[];
}

export interface ReplicationSummaryItemInterface {
  label: string;
  value: string;
  state: 'ok' | 'warning' | 'error' | null;
}

/** table of replication view - channels, connected replicas, slots, publications... */
export interface ReplicationTableInterface {
  id: string;
  title: string;
  columns: string[];
  rows: (string | null)[][];
  /** text when there are no rows */
  empty: string;
}

export type ReplicationActionKindType = 'flushLogs' | 'purgeLogs' | 'startReplica' | 'stopReplica' | 'switchWal' | 'dropSlot';

export type ReplicationActionType =
  /** FLUSH BINARY LOGS - new binary log file */
  | {kind: 'flushLogs'}
  /** PURGE BINARY LOGS TO - logs before the file are deleted */
  | {kind: 'purgeLogs', to: string}
  | {kind: 'startReplica', channel?: string}
  | {kind: 'stopReplica', channel?: string}
  /** pg_switch_wal() */
  | {kind: 'switchWal'}
  | {kind: 'dropSlot', name: string};

export interface ReplicationInterface {
  tabId?: string;
  /** source, replica, primary, standby, standalone */
  role: string;
  summary: ReplicationSummaryItemInterface[];
  tables: ReplicationTableInterface[];
  /** binary logs (MySQL) / WAL files (PostgreSQL), null when they cannot be read */
  logs: {name: string, size: number | null, modified: string | null}[] | null;
  logsTitle: string;
  /** why logs are not shown (binary logging disabled, privileges) */
  logsMessage: string | null;
  /** events of log can be read (SHOW BINLOG EVENTS) */
  logEvents: boolean;
  actions: ReplicationActionKindType[];
  warnings: string[];
}

export interface LogEventsRequestInterface {
  tabId?: string;
  file: string;
  offset: number;
  limit: number;
}

export interface LogEventsInterface {
  tabId?: string;
  file: string;
  offset: number;
  events: {position: number, type: string, serverId: string, endPosition: number, info: string}[];
}

export interface ReplicationActionRequestInterface {
  tabId?: string;
  action: ReplicationActionType;
  dryRun: boolean;
}

export interface ReplicationActionResultInterface {
  tabId?: string;
  kind: string;
  statements: string[];
}

