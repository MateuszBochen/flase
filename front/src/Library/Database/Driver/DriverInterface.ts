import TableInformationInterface from '../../Table/Interface/TableInformationInterface';
import QueryInterface from '../Interface/QueryInterface';
import {SqlValueType} from './SqlLiteralInterface';
import TableInterface from '../../Table/Interface/TableInterface';
import {SearchModeType} from '../Interface/DatabaseSearchInterface';
import SqlDialectType from './SqlDialectType';
import SqlLiteralInterface from './SqlLiteralInterface';
import DriverFeaturesInterface from './DriverFeaturesInterface';
import {SqlSyntaxInterface} from './Syntax/SqlSyntax';
import {DatabaseRoutineInterface, ObjectRefInterface} from '../Interface/DatabaseObjectsInterface';
import {RoutineValueType} from './RoutineCallInterface';


interface DriverInterface {
  readonly dialect: SqlDialectType;

  /** quoting of names and values */
  readonly sql: SqlLiteralInterface;

  /** keywords and functions for completion */
  readonly keywords: string[];

  readonly features: DriverFeaturesInterface;

  /** lexical rules of SQL - strings, names, comments, delimiters */
  readonly syntax: SqlSyntaxInterface;

  /** EXPLAIN of query as JSON (ANALYZE executes it) - next statement is tried when the previous one fails */
  planStatements(query: string, analyze: boolean): string[];

  /** SELECT of function / CALL of procedure with values typed by user */
  routineStatements(database: string, routine: DatabaseRoutineInterface, values: RoutineValueType[]): string[];

  /** CREATE statement of new object - user changes names and body */
  objectTemplate(type: ObjectRefInterface['type'], table: string): string;

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
  getRowsQuery(table: TableInterface, currentDatabase: string, conditions: {column: string, value: SqlValueType}[]): string;

  /**
   * SELECT of rows containing (or equal to) term in any of given columns, same comparison as database search
   */
  getSearchQuery(table: TableInterface, currentDatabase: string, columns: {name: string, text: boolean}[], term: string, mode: SearchModeType): string;
}
export default DriverInterface;
