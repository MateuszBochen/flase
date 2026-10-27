/** schema compare - what changes target database to the structure of source database */

export interface SchemaCompareRequestInterface {
  tabId?: string;
  /** source database of connection of the command */
  database: string;
  /** database of other (or the same) logged in connection - its session is found by token */
  target: {token: string, database: string};
}

export interface SchemaTableDiffInterface {
  name: string;
  /** create - only in source, drop - only in target, alter - in both and different */
  status: 'create' | 'drop' | 'alter';
  /** differences as text, e.g. "add column email varchar(100)" */
  changes: string[];
  /** statements in order of script: foreign keys are dropped first and added last */
  dropForeignKeys: string[];
  statements: string[];
  addForeignKeys: string[];
  /** changes which cannot be done by the script (e.g. expression index) */
  warnings: string[];
}

export interface SchemaCompareResultInterface {
  tabId?: string;
  source: string;
  target: string;
  dialect: string;
  tables: SchemaTableDiffInterface[];
  /** tables of the same structure */
  same: number;
  warnings: string[];
}
