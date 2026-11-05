/** rows of grid query for paging */
interface TotalCountInterface {
  /** null - rows are not known (count failed and database has no estimate) */
  totalCount: number | null;
  tabId?: string;
  /** by plan of database - exact count did not finish in its time limit */
  estimated?: boolean;
  /** time of count (and estimate), not sent for remembered count */
  countMs?: number;
  /** count of the same query of a moment ago - paging, sorting */
  cached?: boolean;
  /** exact count requested by user failed or was cancelled */
  error?: string;
}

export default TotalCountInterface;
