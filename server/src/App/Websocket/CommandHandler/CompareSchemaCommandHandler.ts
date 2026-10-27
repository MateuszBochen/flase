import AbstractCommandHandler from './AbstractCommandHandler';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import {SchemaCompareRequestInterface, SchemaCompareResultInterface} from '../../Driver/Interface/Data/SchemaCompareInterface';
import {compareSchemas} from '../../Driver/SchemaCompare';
import {sessionStore} from '../../Session/SessionStore';

/**
 * differences of structure of two databases (also of two servers) and migration script of target
 */
class CompareSchemaCommandHandler extends AbstractCommandHandler<SchemaCompareRequestInterface> {

  handle = async (data: SchemaCompareRequestInterface): Promise<void> => {
    try {
      if (typeof data.database !== 'string' || !data.database || typeof data.target?.database !== 'string' || !data.target.database || typeof data.target.token !== 'string') {
        throw new Error('Source and target database are required');
      }
      // target is a session of the same browser - token proves it was logged in
      const target = sessionStore.findByToken(data.target.token);
      if (!target) {
        throw new Error('Target connection is not logged in - open it first');
      }
      const result = await compareSchemas(this.driver, data.database, target.session.driver, data.target.database);
      this.clientWebsocket.send<SchemaCompareResultInterface>(new WsMessage<SchemaCompareResultInterface>(
        this.command.connectionData.connection,
        MessageType.SCHEMA_COMPARE,
        {...result, tabId: data.tabId},
      ));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}

export default CompareSchemaCommandHandler;
