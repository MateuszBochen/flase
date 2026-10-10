import AbstractCommandHandler from './AbstractCommandHandler';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import TableStructureRequestInterface from '../../Driver/Interface/Data/TableStructureRequestInterface';
import TableStructureInterface from '../../Driver/Interface/Data/TableStructureInterface';

/**
 * structure of table for "Structure" view
 * @author Mateusz Bochen
 */
class GetTableStructureCommandHandler extends AbstractCommandHandler<TableStructureRequestInterface> {

  handle = async (data: TableStructureRequestInterface): Promise<void> => {
    try {
      if (!data?.table?.databaseName || !data.table.name) {
        throw new Error('Invalid table structure request');
      }
      const structure = await this.driver.getTableStructure(data.table);
      this.clientWebsocket.send<TableStructureInterface>(new WsMessage<TableStructureInterface>(
        this.command.connectionData.connection,
        MessageType.TABLE_STRUCTURE,
        {...structure, tabId: data.tabId},
      ));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}

export default GetTableStructureCommandHandler;
