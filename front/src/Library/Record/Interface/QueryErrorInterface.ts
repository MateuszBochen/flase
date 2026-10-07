
/** command failed on server side, tabId is empty for commands not related to tab */
interface QueryErrorInterface {
  command: string;
  error: string;
  tabId?: string;
}

export default QueryErrorInterface;
