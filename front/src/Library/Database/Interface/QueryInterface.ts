import SortTableItemInterface from '../../../Component/Table/Interface/SortTableItemInterface';


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
