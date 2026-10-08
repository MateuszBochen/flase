import TableInformationInterface from '../../Table/Interface/TableInformationInterface';
import QueryInterface from '../Interface/QueryInterface';
import TableInterface from '../../Table/Interface/TableInterface';
import {SearchModeType} from '../Interface/DatabaseSearchInterface';
import {CellValueType} from '../../../Component/Table/Interface/RecordsViewPropsInterface';
import SqlDialectType from './SqlDialectType';
import SqlLiteralInterface from './SqlLiteralInterface';
import DriverFeaturesInterface from './DriverFeaturesInterface';


interface DriverInterface {
  readonly dialect: SqlDialectType;

  /** quoting of names and values */
  readonly sql: SqlLiteralInterface;

  /** keywords and functions for completion */
  readonly keywords: string[];

  readonly features: DriverFeaturesInterface;

  /**
   * Method for returning default sql
   */
  getDefaultQuery(table: TableInformationInterface): QueryInterface;

  /**
   * Method for returning select statement as string from query.
   * E.G SELECT * FROM will return '*'
   *
   */
  getSelectStringFromQuery(query: QueryInterface): string;

  /**
   * SELECT of rows of table matching all conditions (column = value)
   */
  getRowsQuery(table: TableInterface, currentDatabase: string, conditions: {column: string, value: CellValueType}[]): string;

  /**
   * SELECT of rows containing (or equal to) term in any of given columns, same comparison as database search
   */
  getSearchQuery(table: TableInterface, currentDatabase: string, columns: {name: string, text: boolean}[], term: string, mode: SearchModeType): string;
}
export default DriverInterface;
