import AbstractCommandHandler from './AbstractCommandHandler';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import {
  ServerInfoInterface,
  ServerStatusInterface,
  ServerVariablesInterface,
  SetVariableRequestInterface,
  SetVariableResultInterface,
} from '../../Driver/Interface/Data/ServerInterface';

/** SHOW GLOBAL STATUS / pg_stat_* - client asks repeatedly for monitor, advice only when asked */
export class GetServerStatusCommandHandler extends AbstractCommandHandler<{tabId?: string, withAdvice?: boolean}> {
  handle = async (data: {tabId?: string, withAdvice?: boolean}): Promise<void> => {
    try {
      const status = await this.driver.server().status(!!data?.withAdvice);
      this.clientWebsocket.send<ServerStatusInterface>(new WsMessage<ServerStatusInterface>(
        this.command.connectionData.connection,
        MessageType.SERVER_STATUS,
        {...status, tabId: data?.tabId},
      ));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}

/** SHOW GLOBAL VARIABLES / pg_settings */
export class GetServerVariablesCommandHandler extends AbstractCommandHandler<{tabId?: string}> {
  handle = async (data: {tabId?: string}): Promise<void> => {
    try {
      const variables = await this.driver.server().variables();
      this.clientWebsocket.send<ServerVariablesInterface>(new WsMessage<ServerVariablesInterface>(
        this.command.connectionData.connection,
        MessageType.SERVER_VARIABLES,
        {...variables, tabId: data?.tabId},
      ));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}

/** character sets, collations, engines, extensions */
export class GetServerInfoCommandHandler extends AbstractCommandHandler<{tabId?: string}> {
  handle = async (data: {tabId?: string}): Promise<void> => {
    try {
      const info = await this.driver.server().info();
      this.clientWebsocket.send<ServerInfoInterface>(new WsMessage<ServerInfoInterface>(
        this.command.connectionData.connection,
        MessageType.SERVER_INFO,
        {...info, tabId: data?.tabId},
      ));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}

/** SET GLOBAL / SET PERSIST / ALTER SYSTEM - dryRun returns sql for preview */
export class SetServerVariableCommandHandler extends AbstractCommandHandler<SetVariableRequestInterface> {
  handle = async (data: SetVariableRequestInterface): Promise<void> => {
    try {
      const server = this.driver.server();
      const statements = await server.buildSetVariable(data);
      if (!data.dryRun) {
        await server.executeSetVariable(statements);
      }
      this.clientWebsocket.send<SetVariableResultInterface>(new WsMessage<SetVariableResultInterface>(
        this.command.connectionData.connection,
        data.dryRun ? MessageType.SERVER_VARIABLE_PREVIEW : MessageType.SERVER_VARIABLE_APPLIED,
        {tabId: data.tabId, name: data.name, statements},
      ));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}
