import DatabaseInterface from './Interface/Data/DatabaseInterface';
import {Observable} from 'rxjs';
import ColumnInterface from './Interface/Data/ColumnInterface';
import SelectFromType from '../../Driver/Type/Data/SelectFromType';
import TableInformationInterface from './Interface/Data/TableInformationInterface';
import DriverSessionInterface from './DriverSessionInterface';

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
}

export default DriverInterface;
