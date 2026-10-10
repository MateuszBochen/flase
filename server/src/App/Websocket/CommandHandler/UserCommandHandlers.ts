import AbstractCommandHandler from './AbstractCommandHandler';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import {UserChangeRequestInterface, UserGrantsRequestInterface, UsersRequestInterface} from '../../Driver/Interface/Data/UserInterface';

/** list of accounts with privilege levels which can be granted */
export class GetUsersCommandHandler extends AbstractCommandHandler<UsersRequestInterface> {
  handle = async (data: UsersRequestInterface): Promise<void> => {
    try {
      const users = this.driver.users();
      this.clientWebsocket.send(new WsMessage(this.command.connectionData.connection, MessageType.USERS, {
        tabId: data?.tabId,
        users: await users.getUsers(),
        privilegeLevels: users.getPrivilegeLevels(),
      }));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}

/** GRANT statements of one account */
export class GetUserGrantsCommandHandler extends AbstractCommandHandler<UserGrantsRequestInterface> {
  handle = async (data: UserGrantsRequestInterface): Promise<void> => {
    try {
      if (!data?.user?.name) {
        throw new Error('User is required');
      }
      this.clientWebsocket.send(new WsMessage(this.command.connectionData.connection, MessageType.USER_GRANTS, {
        tabId: data.tabId,
        user: data.user,
        grants: await this.driver.users().getGrants(data.user),
      }));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}

/**
 * CREATE / DROP / password / GRANT / REVOKE.
 * dryRun returns sql for preview (passwords are hidden) - client always shows it before execution.
 */
export class ChangeUserCommandHandler extends AbstractCommandHandler<UserChangeRequestInterface> {
  handle = async (data: UserChangeRequestInterface): Promise<void> => {
    try {
      if (!data?.change?.kind) {
        throw new Error('Invalid user change request');
      }
      const statements = await this.driver.users().buildChange(data.user, data.change);
      if (!data.dryRun) {
        await this.driver.executeStatements(statements.map((statement) => statement.sql));
      }
      this.clientWebsocket.send(new WsMessage(
        this.command.connectionData.connection,
        data.dryRun ? MessageType.USER_CHANGE_PREVIEW : MessageType.USER_CHANGE_APPLIED,
        {tabId: data.tabId, kind: data.change.kind, statements: statements.map((statement) => statement.display)},
      ));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}
