
/** command failed on server side, tabId is empty for commands not related to tab */
interface QueryErrorInterface {
  command: string;
  error: string;
  tabId?: string;
  /** connection is not logged in - answer cannot come until login */
  disconnected?: boolean;
}

export default QueryErrorInterface;
