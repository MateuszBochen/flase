import SortTableItemInterface from '../../../Component/Table/Interface/SortTableItemInterface';
import ColumnInterface from '../../Table/Interface/ColumnInterface';
import {DirectionOrder} from '../../../Component/Table/Enum/DirectionOrder';

/**
 * column of ORDER BY - table is set for qualified name (t.id); position (1, 2…) and size count also other
 * expressions of ORDER BY, e.g. LENGTH(x)
 */
export type OrderItemType = {column: string, table: string | null, direction: DirectionOrder, position: number, size: number};


interface QueryInterface {

  /**
   * Sql query as string
   */
  query: string;

  /**
   * method for change query
   */
  changeQuery: (newQuery: string) => QueryInterface;

  /**
   * method for get selected columns as string
   */
  getOnlyColumnsAsString: () => string;

  /**
   * function for get offset records
   */
  getRecordsLimits: () => {offset: number, limit: number};

  /** function changing offset */
  changeOffset(offset: number): QueryInterface;

  changeOrder(sortOrder: SortTableItemInterface[]): QueryInterface

  /** columns of ORDER BY in their order (other expressions, e.g. LENGTH(x), are left out) */
  getOrder(): OrderItemType[];

  /**
   * sort by column - alone, or with multiple added to current ORDER BY: new column is appended, the same
   * column with other direction changes direction in place, with the same direction it is removed
   */
  toggleOrder(column: ColumnInterface, direction: DirectionOrder, multiple: boolean): QueryInterface;

  /** WHERE condition as text, empty when query has no condition (or WHERE 1) */
  getWhere(): string;

  /**
   * new query with replaced WHERE (empty = no condition), offset is reset to first page.
   * Throws for invalid condition or query which is not a single SELECT.
   */
  changeWhere(where: string): QueryInterface;

  /** the same query without LIMIT - all rows, e.g. for export */
  withoutLimit(): QueryInterface;
}

export default QueryInterface;
