import AbstractCommandHandler from './AbstractCommandHandler';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';

/** databases of PostgreSQL server - level above schemas in tree */
class GetCatalogsCommandHandler extends AbstractCommandHandler<{tabId?: string}> {
  handle = async (data: {tabId?: string}): Promise<void> => {
    try {
      const catalogs = await this.driver.getCatalogs();
      if (!catalogs) {
        throw new Error('Connection has no databases above schemas');
      }
      this.clientWebsocket.send(new WsMessage(this.command.connectionData.connection, MessageType.CATALOGS, {tabId: data?.tabId, catalogs}));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}

export default GetCatalogsCommandHandler;
