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
}

export default QueryInterface;
