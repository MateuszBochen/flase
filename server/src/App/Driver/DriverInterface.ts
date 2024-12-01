import DatabaseInterface from './Interface/Data/DatabaseInterface';
import {Observable} from 'rxjs';
import TableInterface from './Interface/Data/TableInterface';
import TotalCountDto from '../../Driver/Dto/TotalCountDto';
import RowDto from '../../Driver/Dto/RowDto';
import ColumnInterface from './Interface/Data/ColumnInterface';
import SelectFromType from '../../Driver/Type/Data/SelectFromType';
import TableInformationInterface from './Interface/Data/TableInformationInterface';
import UpdateResultType from '../../Driver/Type/UpdateResultType';

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
   * Function returns total rows of given query
   */
  countRecords(query:string):Promise<TotalCountDto>

  /**
   * Function return TotalCountType for getting information about query status
   *
   */
  streamSelect(query:string): Observable<RowDto>;

  /**
   * Function execute update query.
   */
  updateQuery(query:string): Promise<UpdateResultType>;
}

export default DriverInterface;
