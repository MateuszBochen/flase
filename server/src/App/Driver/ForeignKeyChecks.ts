import SqlDialectType from './Query/SqlDialectType';

/**
 * Statements which turn off checks of foreign keys for changes of rows in one transaction (e.g. delete of row
 * referenced by other table). MySQL - session variable, set back after transaction also when it failed.
 * PostgreSQL - replica role skips triggers of foreign keys (and other triggers) until end of transaction,
 * it needs superuser or SET privilege of session_replication_role.
 */
export const FOREIGN_KEY_CHECKS_OFF: {[dialect in SqlDialectType]: {before: string[], after: string[]}} = {
  mysql: {before: ['SET FOREIGN_KEY_CHECKS = 0'], after: ['SET FOREIGN_KEY_CHECKS = 1']},
  postgresql: {before: ["SET LOCAL session_replication_role = 'replica'"], after: []},
};

export interface TransactionOptionsInterface {
  /** foreign keys are not checked - FOREIGN_KEY_CHECKS = 0 (MySQL), session_replication_role = replica (PostgreSQL) */
  ignoreForeignKeys?: boolean;
}
