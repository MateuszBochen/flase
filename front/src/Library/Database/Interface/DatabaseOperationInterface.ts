import {ColumnDefinitionInterface, IndexKindType} from '../../Table/Interface/StructureChangeInterface';
import {ObjectRefInterface} from './DatabaseObjectsInterface';

export type MaintenanceActionType = 'optimize' | 'analyze' | 'check' | 'repair' | 'vacuum' | 'vacuumFull' | 'vacuumAnalyze' | 'reindex';

export interface CreateTableIndexInterface {
  name: string;
  kind: Exclude<IndexKindType, 'PRIMARY'>;
  columns: string[];
}

/**
 * Operations on databases (schemas) and on more objects of database at once.
 * "database" is schema in PostgreSQL.
 */
export type DatabaseOperationType =
  | {kind: 'createDatabase', name: string, collation?: string | null}
  /** convertTables - CONVERT TO CHARACTER SET of every table (also existing columns) */
  | {kind: 'alterDatabase', name: string, collation: string, convertTables: boolean}
  | {kind: 'renameDatabase', name: string, newName: string}
  | {kind: 'dropDatabase', name: string}
  | {
    kind: 'createTable',
    database: string,
    name: string,
    columns: ColumnDefinitionInterface[],
    primaryKey: string[],
    indexes: CreateTableIndexInterface[],
    engine?: string | null,
    collation?: string | null,
    comment?: string,
  }
  /** ignoreForeignKeys - FOREIGN_KEY_CHECKS = 0 (MySQL), CASCADE (PostgreSQL) */
  | {kind: 'tables', action: 'truncate' | 'drop', database: string, tables: string[], ignoreForeignKeys: boolean}
  | {kind: 'maintenance', action: MaintenanceActionType, database: string, tables: string[]}
  | {kind: 'createView', database: string, name: string, select: string, replace: boolean}
  /** CREATE statement written by user; replace - object is dropped before (its definition is restored when CREATE fails) */
  | {kind: 'objectDdl', database: string, sql: string, replace?: ObjectRefInterface | null}
  | {kind: 'dropObject', database: string, object: ObjectRefInterface};

export interface DatabaseOperationRequestInterface {
  tabId?: string;
  operation: DatabaseOperationType;
  /** only build sql for preview */
  dryRun: boolean;
}

/** message of OPTIMIZE / ANALYZE / CHECK / REPAIR / VACUUM for table */
export interface MaintenanceResultInterface {
  table: string;
  operation: string;
  /** status, info, note, warning, error */
  type: string;
  message: string;
}

export interface DatabaseOperationResultInterface {
  tabId?: string;
  kind: string;
  statements: string[];
  results?: MaintenanceResultInterface[];
}
