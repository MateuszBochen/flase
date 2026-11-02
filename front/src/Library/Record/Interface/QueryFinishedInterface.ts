/**
 * steps of query measured by server, milliseconds - client adds network and render;
 * execution is time to the first row (with network between Flase server and database)
 */
export interface ServerQueryTimingInterface {
  /** waiting for free connection of the pool (and USE / read only of new session) */
  sessionMs: number;
  /** structure of tables of the query - types, keys, references */
  metadataMs: number;
  /** COUNT of rows for paging - executed on the same connection before the query, null without count */
  countMs: number | null;
  executionMs: number;
  /** from the first to the last row - reading and sending */
  fetchMs: number;
  /** whole work of server for the query */
  serverMs: number;
}

/** all records of query were received */
interface QueryFinishedInterface {
  rows: number;
  tabId?: string;
  timing?: ServerQueryTimingInterface;
}

export default QueryFinishedInterface;
