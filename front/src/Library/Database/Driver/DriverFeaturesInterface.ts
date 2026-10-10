import {IndexKindType} from '../../Table/Interface/StructureChangeInterface';

/** what the database supports - forms show only what can be done */
interface DriverFeaturesInterface {
  /** name of level under connection - Database (MySQL) or Schema (PostgreSQL) */
  databaseLabel: string;
  /** suggestions of column type */
  columnTypes: string[];
  /** column can be placed FIRST / AFTER other column */
  columnPosition: boolean;
  /** ON UPDATE CURRENT_TIMESTAMP */
  onUpdateTimestamp: boolean;
  indexKinds: IndexKindType[];
  /** prefix length of index column */
  indexLength: boolean;
  /** option of dump creating the database / schema */
  dumpCreateDatabaseLabel: string;
  dumpHint: string;
}

export default DriverFeaturesInterface;
