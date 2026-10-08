import DatabaseInterface from './Interface/Data/DatabaseInterface';
import {Observable} from 'rxjs';
import ColumnInterface from './Interface/Data/ColumnInterface';
import SelectFromType from '../../Driver/Type/Data/SelectFromType';
import TableInformationInterface from './Interface/Data/TableInformationInterface';
import DriverSessionInterface from './DriverSessionInterface';
import TableInterface from './Interface/Data/TableInterface';
import RowChangeInterface from './Interface/Data/RowChangeInterface';
import RowChangeStatementInterface from './Interface/Data/RowChangeStatementInterface';
import TableStructureInterface from './Interface/Data/TableStructureInterface';
import {StructureChangeType} from './Interface/Data/StructureChangeInterface';
import {DatabaseSearchResultInterface, SearchModeType} from './Interface/Data/DatabaseSearchInterface';

interface DriverInterface {

  /**
   * Connect to the server and check credentials.
   */
  connect(): Promise<DriverInterface>;

  /**
   * Close all connections of driver
   */
  disconnect(): void;

  /**
   * Close database connections while nobody uses them, they are opened again on next query
   */
  releaseConnections(): void;

  /**
   * Open dedicated session with given database selected
   */
  openSession(database: string): Promise<DriverSessionInterface>;

  /**
   * Return Database object on ech new result getting from database
   */
  getListOfDatabases(): Observable<DatabaseInterface>;

  /**
   * Return Database object on ech new result getting from database
   */
  getListOfTablesInDatabase(databaseName: string): Observable<TableInformationInterface>;

  /**
   * get list of from type to match table columns
   */
  getSelectFromTypeFromQuery(query:string): SelectFromType[];

  /**
   * Returns list of columns of given table
   */
  getColumnsOfTable(databaseName: string, selectFromType: SelectFromType):Promise<ColumnInterface[]>;

  /**
   * Returns table which rows can be edited in result of given query,
   * or reason why result is read only.
   */
  getEditableTableOfQuery(query: string): {table: SelectFromType | null, reason?: string};

  /**
   * Build escaped sql statements for row changes of given table
   */
  buildRowChangeStatements(table: TableInterface, changes: RowChangeInterface[]): RowChangeStatementInterface[];

  /**
   * Columns, indexes, keys, triggers and DDL of table (or view)
   */
  getTableStructure(table: TableInterface): Promise<TableStructureInterface>;

  /**
   * Build escaped DDL statements for structure change. Throws for invalid definition.
   */
  buildStructureChangeStatements(table: TableInterface, change: StructureChangeType): Promise<string[]>;

  /**
   * Execute DDL statements one by one (DDL is committed immediately, it cannot be rolled back)
   */
  executeStatements(statements: string[]): Promise<void>;

  /**
   * Search term in all searchable columns of all tables of database.
   * onResult is called for every table with matches, resolves with number of tables and warnings.
   */
  searchDatabase(
    database: string,
    term: string,
    mode: SearchModeType,
    onResult: (result: DatabaseSearchResultInterface) => void,
  ): Promise<{tables: number, warnings: string[]}>;
}

export default DriverInterface;
