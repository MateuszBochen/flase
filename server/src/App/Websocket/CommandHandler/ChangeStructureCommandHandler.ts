import AbstractCommandHandler from './AbstractCommandHandler';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import StructureChangeRequestInterface from '../../Driver/Interface/Data/StructureChangeInterface';
import StructureChangeResultInterface from '../../Driver/Interface/Data/StructureChangeResultInterface';

/**
 * ALTER / TRUNCATE / DROP / RENAME / COPY of table.
 * dryRun only returns sql for preview - client always shows it before execution.
 * @author Mateusz Bochen
 */
class ChangeStructureCommandHandler extends AbstractCommandHandler<StructureChangeRequestInterface> {

  handle = async (data: StructureChangeRequestInterface): Promise<void> => {
    try {
      if (!data?.table?.databaseName || !data.table.name || !data.change?.kind) {
        throw new Error('Invalid structure change request');
      }
      const statements = await this.driver.buildStructureChangeStatements(data.table, data.change);

      if (!data.dryRun) {
        await this.driver.executeStatements(statements);
      }

      this.clientWebsocket.send<StructureChangeResultInterface>(new WsMessage<StructureChangeResultInterface>(
        this.command.connectionData.connection,
        data.dryRun ? MessageType.STRUCTURE_CHANGE_PREVIEW : MessageType.STRUCTURE_CHANGE_APPLIED,
        {tabId: data.tabId, kind: data.change.kind, statements},
      ));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}

export default ChangeStructureCommandHandler;
