import AbstractCommandHandler from './AbstractCommandHandler';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import {TransferRequestType} from '../../Driver/Interface/Data/TransferInterface';
import TransferRegistry from '../../Transfer/TransferRegistry';

type CreateTransferType = {tabId?: string, transfer: TransferRequestType};

const isName = (value: any) => typeof value === 'string' && value.trim().length > 0;

/**
 * one time ticket for dump download / import upload over HTTP
 * @author Mateusz Bochen
 */
class CreateTransferCommandHandler extends AbstractCommandHandler<CreateTransferType> {

  handle = (data: CreateTransferType): void => {
    try {
      const transfer = data?.transfer;
      if (!data?.tabId) {
        throw new Error('Transfer needs tab');
      }
      CreateTransferCommandHandler.validate(transfer);

      const ticket = TransferRegistry.create({
        request: transfer,
        driver: this.driver,
        tabId: data.tabId,
        notify: (message, payload) => this.clientWebsocket.send(new WsMessage(
          this.command.connectionData.connection, message, {...payload, tabId: data.tabId},
        )),
      });
      this.clientWebsocket.send(new WsMessage(this.command.connectionData.connection, MessageType.TRANSFER_TICKET, {tabId: data.tabId, ticket}));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }

  private static validate(transfer: TransferRequestType): void {
    switch (transfer?.kind) {
      case 'dump':
        if (!isName(transfer.options?.database) || !Array.isArray(transfer.options.tables)) throw new Error('Database is required');
        if (!transfer.options.structure && !transfer.options.data) throw new Error('Select structure or data');
        return;
      case 'import-sql':
        return;
      case 'import-csv': {
        const options = transfer.options;
        if (!isName(options?.database) || !isName(options.table)) throw new Error('Database and table are required');
        if (!Array.isArray(options.columns) || !options.columns.some((column) => isName(column))) throw new Error('Select at least one target column');
        if (typeof options.delimiter !== 'string' || options.delimiter.length !== 1) throw new Error('Delimiter must be one character');
        return;
      }
      default:
        throw new Error('Unknown transfer');
    }
  }
}

export default CreateTransferCommandHandler;
