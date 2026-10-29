import ConnectionDataInterface from '../Connection/Interface/ConnectionDataInterface';
import DriverFactory from '../Database/Driver/DriverFactory';
import TableManager from '../Table/TableManager';
import {binaryUuidLiterals, UuidTableLookupType} from './UuidLiterals';

/** columns of tables from loaded lists of tables of the connection */
export const loadedTablesLookup = (connection: ConnectionDataInterface, currentDatabase: string | null): UuidTableLookupType => {
  const dialect = DriverFactory.getDriver(connection).dialect;
  return (database, table) => {
    const name = database ?? currentDatabase;
    if (!name) return undefined;
    const tables = TableManager.getInstance().getTablesListForDatabase(connection, {name});
    const found = tables.find((item) => dialect === 'mysql' ? item.tableName.toLowerCase() === table.toLowerCase() : item.tableName === table);
    return found && found.columns.length ? found.columns : undefined;
  };
};

/** statements of connection with UUID strings of BINARY(16) columns converted */
const withBinaryUuids = (connection: ConnectionDataInterface, database: string | null, statements: string[]): string[] => {
  const driver = DriverFactory.getDriver(connection);
  if (driver.dialect !== 'mysql') return statements;
  const lookup = loadedTablesLookup(connection, database);
  return statements.map((sql) => binaryUuidLiterals(sql, driver.dialect, lookup).sql);
};

export default withBinaryUuids;
