import AbstractCommandHandler from './AbstractCommandHandler';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import {ProcessListInterface} from '../../Driver/Interface/Data/StatementInterface';

/** stop query running in tab (KILL QUERY of its session) */
export class CancelQueryCommandHandler extends AbstractCommandHandler<{tabId?: string}> {
  handle = async (data: {tabId?: string}): Promise<void> => {
    try {
      const cancelled = data?.tabId ? await this.driver.cancel(data.tabId) : false;
      this.clientWebsocket.send(new WsMessage(this.command.connectionData.connection, MessageType.QUERY_CANCELLED, {tabId: data?.tabId, cancelled}));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}

/** SHOW FULL PROCESSLIST */
export class GetProcessListCommandHandler extends AbstractCommandHandler<{tabId?: string}> {
  handle = async (data: {tabId?: string}): Promise<void> => {
    try {
      const processes = await this.driver.getProcessList();
      this.clientWebsocket.send<ProcessListInterface>(new WsMessage<ProcessListInterface>(
        this.command.connectionData.connection,
        MessageType.PROCESSLIST,
        {tabId: data?.tabId, processes},
      ));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}

/** KILL QUERY / KILL CONNECTION of thread */
export class KillProcessCommandHandler extends AbstractCommandHandler<{tabId?: string, id: number, connection: boolean}> {
  handle = async (data: {tabId?: string, id: number, connection: boolean}): Promise<void> => {
    try {
      await this.driver.killProcess(Number(data?.id), !!data?.connection);
      this.clientWebsocket.send(new WsMessage(this.command.connectionData.connection, MessageType.PROCESS_KILLED, {
        tabId: data.tabId, id: data.id, connection: !!data.connection,
      }));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}
