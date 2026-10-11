import AbstractCommandHandler from './AbstractCommandHandler';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import {
  DatabaseOperationRequestInterface,
  DatabaseOperationResultInterface,
  MaintenanceResultInterface,
} from '../../Driver/Interface/Data/DatabaseOperationInterface';

/**
 * Create / alter / rename / drop of database, create table, operations on more tables (drop, truncate, maintenance),
 * views, routines, triggers and events.
 * dryRun only returns sql for preview - client always shows it before execution.
 * @author Mateusz Bochen
 */
class DatabaseOperationCommandHandler extends AbstractCommandHandler<DatabaseOperationRequestInterface> {

  handle = async (data: DatabaseOperationRequestInterface): Promise<void> => {
    try {
      if (!data?.operation?.kind) {
        throw new Error('Invalid database operation request');
      }
      const statements = await this.driver.buildDatabaseOperationStatements(data.operation);
      let results: MaintenanceResultInterface[] | undefined;

      if (!data.dryRun) {
        results = await this.driver.executeDatabaseOperation(data.operation, statements);
      }

      this.clientWebsocket.send<DatabaseOperationResultInterface>(new WsMessage<DatabaseOperationResultInterface>(
        this.command.connectionData.connection,
        data.dryRun ? MessageType.DATABASE_OPERATION_PREVIEW : MessageType.DATABASE_OPERATION_APPLIED,
        {tabId: data.tabId, kind: data.operation.kind, statements, results},
      ));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}

export default DatabaseOperationCommandHandler;
