import AbstractCommandHandler from './AbstractCommandHandler';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import {
  DatabaseObjectsInterface,
  ObjectDdlInterface,
  ObjectDdlRequestInterface,
  ServerOptionsInterface,
} from '../../Driver/Interface/Data/DatabaseObjectsInterface';

/** tables, routines, triggers and events of database */
export class GetDatabaseObjectsCommandHandler extends AbstractCommandHandler<{tabId?: string, database: string}> {
  handle = async (data: {tabId?: string, database: string}): Promise<void> => {
    try {
      if (!data?.database) {
        throw new Error('Database is required');
      }
      const objects = await this.driver.getDatabaseObjects(data.database);
      this.clientWebsocket.send<DatabaseObjectsInterface>(new WsMessage<DatabaseObjectsInterface>(
        this.command.connectionData.connection,
        MessageType.DATABASE_OBJECTS,
        {...objects, tabId: data.tabId},
      ));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}

/** collations and engines for forms */
export class GetServerOptionsCommandHandler extends AbstractCommandHandler<{tabId?: string}> {
  handle = async (data: {tabId?: string}): Promise<void> => {
    try {
      const options = await this.driver.getServerOptions();
      this.clientWebsocket.send<ServerOptionsInterface>(new WsMessage<ServerOptionsInterface>(
        this.command.connectionData.connection,
        MessageType.SERVER_OPTIONS,
        {...options, tabId: data?.tabId},
      ));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}

/** CREATE statement of routine, trigger, event or view - for editing */
export class GetObjectDdlCommandHandler extends AbstractCommandHandler<ObjectDdlRequestInterface> {
  handle = async (data: ObjectDdlRequestInterface): Promise<void> => {
    try {
      if (!data?.database || !data.object?.type || !data.object.name) {
        throw new Error('Invalid object');
      }
      const ddl = await this.driver.getObjectDdl(data.database, data.object);
      this.clientWebsocket.send<ObjectDdlInterface>(new WsMessage<ObjectDdlInterface>(
        this.command.connectionData.connection,
        MessageType.OBJECT_DDL,
        {tabId: data.tabId, database: data.database, object: data.object, ddl},
      ));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}
