/**
 * what the database supports - code shared by drivers (schema compare, login) asks these instead of the dialect
 * @author Mateusz Bochen
 */
interface DriverFeaturesInterface {
  /** column can be placed FIRST / AFTER other column (PostgreSQL adds columns at the end) */
  columnPosition: boolean;
  /** databases of server above schemas - connection to other database of the same login */
  databasesAboveSchemas: boolean;
}

export default DriverFeaturesInterface;
