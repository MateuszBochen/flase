import TableInterface from './TableInterface';

export interface StructureColumnInterface {
  name: string;
  /** full type, e.g. varchar(191), int(10) unsigned, enum('a','b') */
  type: string;
  nullable: boolean;
  /** null when column has no default (or default NULL - see nullable) */
  defaultValue: string | null;
  /** default is expression (CURRENT_TIMESTAMP, uuid(), ...), not a literal value */
  defaultIsExpression: boolean;
  /** expression of generated (virtual / stored) column */
  generationExpression: string | null;
  /** e.g. auto_increment, on update current_timestamp(), VIRTUAL GENERATED */
  extra: string;
  comment: string;
  collation: string | null;
  /** PRI, UNI, MUL or empty */
  key: string;
}

export interface StructureIndexInterface {
  name: string;
  unique: boolean;
  primary: boolean;
  /** BTREE, HASH, FULLTEXT, SPATIAL */
  type: string;
  /** column name, or expression for functional index */
  columns: {name: string, subPart: number | null, descending: boolean}[];
  comment: string;
}

export interface StructureForeignKeyInterface {
  name: string;
  /** table which holds the key */
  table: TableInterface;
  columns: string[];
  referencedTable: TableInterface;
  referencedColumns: string[];
  onUpdate: string;
  onDelete: string;
}

export interface StructureTriggerInterface {
  name: string;
  /** BEFORE / AFTER */
  timing: string;
  /** INSERT / UPDATE / DELETE */
  event: string;
  statement: string;
}

export interface StructureTableInfoInterface {
  /** BASE TABLE, VIEW, SYSTEM VIEW */
  type: string;
  engine: string | null;
  collation: string | null;
  rowFormat: string | null;
  /** approximate for InnoDB */
  rows: number | null;
  dataLength: number | null;
  indexLength: number | null;
  autoIncrement: number | null;
  comment: string;
  createTime: string | null;
  updateTime: string | null;
}

interface TableStructureInterface {
  table: TableInterface;
  info: StructureTableInfoInterface | null;
  columns: StructureColumnInterface[];
  indexes: StructureIndexInterface[];
  foreignKeys: StructureForeignKeyInterface[];
  /** foreign keys of other tables pointing to this table */
  referencedBy: StructureForeignKeyInterface[];
  triggers: StructureTriggerInterface[];
  /** SHOW CREATE TABLE / VIEW */
  ddl: string;
  /** parts which could not be loaded, e.g. missing privileges */
  warnings: string[];
  tabId?: string;
}

export default TableStructureInterface;
