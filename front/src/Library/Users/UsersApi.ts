import ConnectionManager from '../Connection/ConnectionManager';
import ConnectionDataInterface from '../Connection/Interface/ConnectionDataInterface';
import CommandType from '../WebSocket/Enum/CommandType';
import {UserChangeType} from './UserInterface';

type UserRefType = {name: string, host: string | null};

/** user accounts commands - answers come as websocket messages with tabId */
class UsersApi {
  private static send(connection: ConnectionDataInterface, command: CommandType, payload: any): void {
    const manager = ConnectionManager.getInstance();
    const established = manager.getEstablishedConnection(connection);
    manager.getClientForConnection(established).sendCommand({connectionData: established, command, payload});
  }

  static loadUsers(connection: ConnectionDataInterface, tabId: string): void {
    UsersApi.send(connection, CommandType.GET_USERS, {tabId});
  }

  static loadGrants(connection: ConnectionDataInterface, tabId: string, user: UserRefType): void {
    UsersApi.send(connection, CommandType.GET_USER_GRANTS, {tabId, user});
  }

  /** dryRun - only SQL for preview */
  static change(connection: ConnectionDataInterface, tabId: string, user: UserRefType | null, change: UserChangeType, dryRun: boolean): void {
    UsersApi.send(connection, CommandType.CHANGE_USER, {tabId, user, change, dryRun});
  }
}

export default UsersApi;
