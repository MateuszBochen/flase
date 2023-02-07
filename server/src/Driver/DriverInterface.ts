import Database from './Type/Data/Database';
import {Observable} from 'rxjs';
import TableType from './Type/Data/TableType';
import TotalCountDto from './Dto/TotalCountDto';
import RowDto from './Dto/RowDto';
import ColumnType from './Type/Data/ColumnType';
import SelectFromType from './Type/Data/SelectFromType';

interface DriverInterface {

  // connectionData: ConnectionDataType;

  /**
   * Constructor.
   */
  // new(connectionData: ConnectionDataType): {connectionData: ConnectionDataType};

  /**
   * Returns unique token per adapter instance.
   * This is needed for communication between frontend appreciation and server.
   * Function should return unique string token or empty sting if something is wrong with getting access to database.
   * static metod is not supported by type script
   */
  connect(): Promise<DriverInterface>;

  /**
   * Use given database
   */
  selectDatabase(database: string): Promise<void>;

  /**
   * Return Database object on ech new result getting from database
   */
  getListOfDatabases(): Observable<Database>;

  /**
   * Return Database object on ech new result getting from database
   */
  getListOfTablesInDatabase(databaseName: string): Observable<TableType>;

  /**
   * get list of from type to match table columns
   */
  getSelectFromTypeFromQuery(query:string): SelectFromType[];

  /**
   * Returns list of columns of given table
   */
  getColumnsOfTable(databaseName: string, selectFromType: SelectFromType):Promise<ColumnType[]>;

  /**
   * Function returns total rows of given query
   */
  countRecords(query:string):Promise<TotalCountDto>

  /**
   * Function return TotalCountType for getting information about query status
   *
   */
  streamSelect(query:string): Observable<RowDto>;
}

export default DriverInterface;
