/** statements turning checks of foreign keys off (before) and on again (after) - built by driver */
export interface ForeignKeyChecksOffInterface {
  before: string[];
  after: string[];
}

/**
 * transaction - changes of rows in one transaction (e.g. delete of row referenced by other table),
 * session - statements of the whole session (import of script runs statements one by one, not in one transaction)
 */
export type ForeignKeyChecksScopeType = 'transaction' | 'session';

export interface TransactionOptionsInterface {
  /** foreign keys are not checked */
  ignoreForeignKeys?: boolean;
}
