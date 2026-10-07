
/** sent when all records of query were sent */
interface QueryFinishedInterface {
  rows: number;
  tabId?: string;
}

export default QueryFinishedInterface;
