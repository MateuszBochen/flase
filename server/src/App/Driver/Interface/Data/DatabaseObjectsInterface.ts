/** objects of database (schema) - overview tab, phpMyAdmin "Structure" of database */

export interface DatabaseTableItemInterface {
  name: string;
  /** BASE TABLE, VIEW, MATERIALIZED VIEW, PARTITIONED TABLE, FOREIGN TABLE, SYSTEM VIEW */
  type: string;
  isView: boolean;
  engine: string | null;
  collation: string | null;
  /** approximate (InnoDB statistics, pg reltuples) */
  rows: number | null;
  dataLength: number | null;
  indexLength: number | null;
  comment: string;
}

export interface RoutineParameterInterface {
  /** IN, OUT, INOUT, VARIADIC */
  mode: string;
  name: string;
  type: string;
}

export interface DatabaseRoutineInterface {
  kind: 'PROCEDURE' | 'FUNCTION';
  name: string;
  /** identity arguments of PostgreSQL (overloaded functions), '' in MySQL */
  signature: string;
  parameters: RoutineParameterInterface[];
  /** return type of function */
  returns: string | null;
  language: string | null;
  comment: string;
}

export interface DatabaseTriggerItemInterface {
  name: string;
  table: string;
  timing: string;
  event: string;
}

export interface DatabaseEventInterface {
  name: string;
  /** ENABLED, DISABLED, SLAVESIDE_DISABLED */
  status: string;
  /** EVERY 1 DAY, AT 2026-01-01 00:00:00 */
  schedule: string;
  lastExecuted: string | null;
  comment: string;
}

export interface DatabaseObjectsInterface {
  tabId?: string;
  database: string;
  /** default collation of database, null in PostgreSQL (schema has none) */
  collation: string | null;
  tables: DatabaseTableItemInterface[];
  routines: DatabaseRoutineInterface[];
  triggers: DatabaseTriggerItemInterface[];
  /** null - database has no events (PostgreSQL) */
  events: DatabaseEventInterface[] | null;
  /** value of event_scheduler (OFF - events do not run) */
  eventScheduler: string | null;
  /** parts which could not be read (privileges) */
  warnings: string[];
}

/** choices of forms - collations and storage engines of server */
export interface ServerOptionsInterface {
  tabId?: string;
  collations: {name: string, charset: string, isDefault: boolean}[];
  engines: {name: string, isDefault: boolean}[];
  defaultCollation: string | null;
}

/** object which can be edited (DDL), dropped or executed */
export interface ObjectRefInterface {
  type: 'PROCEDURE' | 'FUNCTION' | 'TRIGGER' | 'EVENT' | 'VIEW';
  name: string;
  /** identity arguments of PostgreSQL function / procedure */
  signature?: string;
  /** table of PostgreSQL trigger (trigger name is unique per table) */
  table?: string;
}

export interface ObjectDdlRequestInterface {
  tabId?: string;
  database: string;
  object: ObjectRefInterface;
}

export interface ObjectDdlInterface {
  tabId?: string;
  database: string;
  object: ObjectRefInterface;
  ddl: string;
}
