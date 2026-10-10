import CommandType from '../../../Websocket/Enum/CommandType';

/** sent when command fails, tabId is empty for commands not related to tab */
interface QueryErrorInterface {
  command: CommandType | string;
  error: string;
  tabId?: string;
}

export default QueryErrorInterface;
