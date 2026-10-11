import AbstractCommandHandler from './AbstractCommandHandler';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import {
  BinaryValueRequestInterface,
  BinaryValueResultInterface,
  FindReplaceRequestInterface,
  FindReplaceResultInterface,
} from '../../Driver/Interface/Data/CellToolsInterface';

/** find and replace in column - dryRun returns count, sample rows and UPDATE for preview */
export class FindReplaceCommandHandler extends AbstractCommandHandler<FindReplaceRequestInterface> {
  handle = async (data: FindReplaceRequestInterface): Promise<void> => {
    try {
      if (!data?.table?.databaseName || !data.table.name || !data.column) {
        throw new Error('Invalid find and replace request');
      }
      const result = await this.driver.findReplace(data);
      this.clientWebsocket.send<FindReplaceResultInterface>(new WsMessage<FindReplaceResultInterface>(
        this.command.connectionData.connection,
        data.dryRun ? MessageType.FIND_REPLACE_PREVIEW : MessageType.FIND_REPLACE_APPLIED,
        {...result, tabId: data.tabId},
      ));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}

/** whole value of binary cell - image transformation, download */
export class GetBinaryValueCommandHandler extends AbstractCommandHandler<BinaryValueRequestInterface> {
  handle = async (data: BinaryValueRequestInterface): Promise<void> => {
    try {
      if (!data?.table?.name || !data.column || !data.where || !Object.keys(data.where).length) {
        throw new Error('Row of binary value cannot be identified');
      }
      const result = await this.driver.getBinaryValue(data);
      this.clientWebsocket.send<BinaryValueResultInterface>(new WsMessage<BinaryValueResultInterface>(
        this.command.connectionData.connection,
        MessageType.BINARY_VALUE,
        {...result, tabId: data.tabId},
      ));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}
