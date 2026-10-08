import AbstractCommandHandler from './AbstractCommandHandler';
import WsMessage from '../Dto/WsMessage';
import MessageType from '../Enum/MessageType';
import {
  DatabaseSearchFinishedInterface,
  DatabaseSearchRequestInterface,
  DatabaseSearchResultInterface,
} from '../../Driver/Interface/Data/DatabaseSearchInterface';

/**
 * search of value in all tables of database, results are sent table by table
 * @author Mateusz Bochen
 */
class SearchDatabaseCommandHandler extends AbstractCommandHandler<DatabaseSearchRequestInterface> {

  handle = async (data: DatabaseSearchRequestInterface): Promise<void> => {
    try {
      if (!data?.database?.name || typeof data.term !== 'string' || !data.term.length) {
        throw new Error('Database and search term are required');
      }
      let tablesWithMatches = 0;
      const summary = await this.driver.searchDatabase(data.database.name, data.term, data.mode === 'exact' ? 'exact' : 'contains', (result) => {
        tablesWithMatches++;
        this.clientWebsocket.send<DatabaseSearchResultInterface>(new WsMessage<DatabaseSearchResultInterface>(
          this.command.connectionData.connection,
          MessageType.DATABASE_SEARCH_RESULT,
          {...result, tabId: data.tabId},
        ));
      });

      this.clientWebsocket.send<DatabaseSearchFinishedInterface>(new WsMessage<DatabaseSearchFinishedInterface>(
        this.command.connectionData.connection,
        MessageType.DATABASE_SEARCH_FINISHED,
        {tabId: data.tabId, tables: summary.tables, tablesWithMatches, warnings: summary.warnings},
      ));
    } catch (e) {
      this.sendError(e, data?.tabId);
    }
  }
}

export default SearchDatabaseCommandHandler;
