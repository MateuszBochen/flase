import {IndexKindType} from '../../Table/Interface/StructureChangeInterface';

/** maintenance of tables offered in menus - OPTIMIZE / VACUUM... */
export type MaintenanceActionType = {action: string, label: string, hint: string};

/**
 * what the database supports and how it names things - forms show only what can be done,
 * components never check the dialect themselves
 */
interface DriverFeaturesInterface {
  /** name of database family shown to user, e.g. in schema compare */
  productName: string;
  /** name of level under connection - Database (MySQL) or Schema (PostgreSQL) */
  databaseLabel: string;
  /** suggestions of column type */
  columnTypes: string[];
  /** type of auto increment primary key of new table */
  autoIncrementType: string;
  /** column can be placed FIRST / AFTER other column */
  columnPosition: boolean;
  /** ON UPDATE CURRENT_TIMESTAMP */
  onUpdateTimestamp: boolean;
  indexKinds: IndexKindType[];
  /** prefix length of index column */
  indexLength: boolean;
  /** ON DELETE / ON UPDATE actions of foreign key, the first one is default */
  foreignKeyActions: string[];
  /** storage engine chosen per table (InnoDB, MyISAM...) */
  tableEngine: boolean;
  /** collation of database and table can be chosen and changed */
  collations: boolean;
  /** DDL is transactional - more statements are executed all or nothing */
  transactionalDdl: boolean;
  /** UUID typed as text is converted for BINARY(16) columns (no native uuid type) */
  binaryUuidText: boolean;
  maintenanceActions: MaintenanceActionType[];
  /** option of dump creating the database / schema */
  dumpCreateDatabaseLabel: string;
  dumpHint: string;
  labels: {
    /** storage of one table - Engine / Access method */
    engine: string;
    /** list of storages of server */
    engines: string;
    /** support column of list of storages */
    engineSupport: string;
    /** encoding of collation */
    characterSet: string;
    /** chart of cache efficiency of monitor */
    hitRatio: string;
    /** chart of executed work per second of monitor */
    rates: string;
  };
  hints: {
    regexReplace: string;
    /** how to write CREATE statement of routine / trigger */
    objectEditor: string;
    /** what happens with object changed in editor */
    objectReplace: string;
    autoIncrement: string;
    autoIncrementPlaceholder: string;
    /** option of DROP / TRUNCATE of table(s) ignoring foreign keys */
    ignoreForeignKeys: (action: string, many: boolean) => string;
    /** shown with rename of database, null without note */
    renameDatabase: string | null;
    /** shown in form of rename of database, null without note */
    renameDatabaseForm: string | null;
    dropDatabase: string | null;
    /** object replaced by DROP + CREATE is restored when CREATE fails */
    objectRestore: string | null;
  };
}

export default DriverFeaturesInterface;
