import TableInterface from './TableInterface';

export type ColumnDefaultType =
  | {kind: 'none'}
  | {kind: 'null'}
  | {kind: 'value', value: string}
  /** e.g. CURRENT_TIMESTAMP, other expressions are wrapped in parentheses */
  | {kind: 'expression', value: string};

export interface ColumnDefinitionInterface {
  name: string;
  /** e.g. varchar(100), int unsigned, enum('a','b') */
  type: string;
  nullable: boolean;
  defaultValue: ColumnDefaultType;
  autoIncrement: boolean;
  onUpdateCurrentTimestamp: boolean;
  comment: string;
  /** kept when column is changed, otherwise table default collation would be used */
  collation: string | null;
}

export type ColumnPositionType = {kind: 'end'} | {kind: 'first'} | {kind: 'after', column: string};

export type IndexKindType = 'INDEX' | 'UNIQUE' | 'FULLTEXT' | 'PRIMARY';

export type AlterOperationType =
  | {op: 'addColumn', column: ColumnDefinitionInterface, position: ColumnPositionType}
  /** name - current name of column, column.name can rename it */
  | {op: 'changeColumn', name: string, column: ColumnDefinitionInterface, position: ColumnPositionType}
  | {op: 'dropColumn', name: string}
  | {op: 'addIndex', name: string, kind: IndexKindType, columns: {name: string, length: number | null}[]}
  | {op: 'dropIndex', name: string};

export type StructureChangeType =
  | {kind: 'alter', operations: AlterOperationType[]}
  | {kind: 'truncate'}
  | {kind: 'drop'}
  | {kind: 'rename', newName: string}
  | {kind: 'copy', newName: string, withData: boolean};

interface StructureChangeRequestInterface {
  tabId?: string;
  table: TableInterface;
  change: StructureChangeType;
  /** only build sql for preview */
  dryRun: boolean;
}

export default StructureChangeRequestInterface;
