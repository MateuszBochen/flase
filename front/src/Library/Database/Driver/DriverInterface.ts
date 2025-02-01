import TableInformationInterface from '../../Table/Interface/TableInformationInterface';
import QueryInterface from '../Interface/QueryInterface';


interface DriverInterface {
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
}
export default DriverInterface;
