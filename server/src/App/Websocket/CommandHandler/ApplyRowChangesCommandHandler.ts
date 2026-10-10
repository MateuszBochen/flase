import AbstractCommandHandler from './AbstractCommandHandler';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import ApplyRowChangesRequestInterface from '../../Driver/Interface/Data/ApplyRowChangesRequestInterface';
import RowChangesResultInterface from '../../Driver/Interface/Data/RowChangesResultInterface';
import RowChangeStatementInterface from '../../Driver/Interface/Data/RowChangeStatementInterface';
import DriverSessionInterface from '../../Driver/DriverSessionInterface';

/**
 * Builds sql for edited / inserted / deleted rows.
 * dryRun only returns sql for preview, otherwise all statements are executed in one transaction.
 * @author Mateusz Bochen
 */
class ApplyRowChangesCommandHandler extends AbstractCommandHandler<ApplyRowChangesRequestInterface> {

  handle = async (data: ApplyRowChangesRequestInterface): Promise<void> => {
    let statements: RowChangeStatementInterface[];
    try {
      if (!data?.table?.name || !data.table.databaseName || !Array.isArray(data.changes) || !data.changes.length) {
        throw new Error('Invalid row changes request');
      }
      statements = this.driver.buildRowChangeStatements(data.table, data.changes);
    } catch (e) {
      this.sendError(e, data?.tabId);
      return;
    }

    if (data.dryRun) {
      this.sendResult(MessageType.ROW_CHANGES_PREVIEW, data, statements, 0);
      return;
    }

    let session: DriverSessionInterface | null = null;
    try {
      session = await this.driver.openSession(data.database?.name || data.table.databaseName);
      const affectedRows = await session.executeInTransaction(statements);
      this.sendResult(MessageType.ROW_CHANGES_APPLIED, data, statements, affectedRows);
    } catch (e) {
      this.sendError(e, data.tabId);
    } finally {
      session?.release();
    }
  }

  private sendResult(
    message: MessageType,
    data: ApplyRowChangesRequestInterface,
    statements: RowChangeStatementInterface[],
    affectedRows: number,
  ): void {
    this.clientWebsocket.send<RowChangesResultInterface>(new WsMessage<RowChangesResultInterface>(
      this.command.connectionData.connection,
      message,
      {
        tabId: data.tabId,
        statements: statements.map((statement) => statement.sql),
        affectedRows,
      },
    ));
  }
}

export default ApplyRowChangesCommandHandler;
