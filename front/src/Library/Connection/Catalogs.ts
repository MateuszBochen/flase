import {parseConnectionDsn} from './Dsn';
import EventBus from '../EventBus/EventBus';
import EventInterface from '../EventBus/EventInterface';
import TabMessages from '../WebSocket/TabMessages';
import MessageInterface from '../WebSocket/Interface/MessageInterface';
import MessageType from '../WebSocket/Enum/MessageType';
import CommandType from '../WebSocket/Enum/CommandType';
import {sendServerCommand} from '../Server/useServerRequest';
import ConnectionDataInterface from './Interface/ConnectionDataInterface';
import {engineOfScheme} from './Engines';

/** database of PostgreSQL server */
export interface CatalogInterface {
  name: string;
  canConnect: boolean;
  /** database of the connection itself */
  current: boolean;
  size: number | null;
}

class CatalogsWereReceived implements EventInterface<string> {
  constructor(private readonly connectionId: string) {
  }

  getData(): string {
    return this.connectionId;
  }
}

/** loaded lists by connection id */
const lists: {[connectionId: string]: CatalogInterface[]} = {};

/**
 * PostgreSQL connection without database in DSN shows databases of server, under each database its schemas -
 * database is opened as own connection with login of the parent connection.
 */
const Catalogs = {
  eventClass: CatalogsWereReceived,

  /** connection shows databases above schemas */
  hasCatalogs: (connection: ConnectionDataInterface): boolean => {
    if (connection.parentId) return false;
    const parsed = parseConnectionDsn(connection.dsn);
    return parsed.success && !!engineOfScheme(parsed.value.driver)?.catalogs && !parsed.value.db;
  },

  /** connection of database - the same address, login and settings, own id */
  childConnection: (parent: ConnectionDataInterface, database: string): ConnectionDataInterface => ({
    ...parent,
    id: `${parent.id}::${database}`,
    displayName: `${parent.displayName} / ${database}`,
    catalog: database,
    parentId: parent.id,
  }),

  listOf: (connection: ConnectionDataInterface): CatalogInterface[] | null => lists[connection.id] || null,

  load: (connection: ConnectionDataInterface) => {
    const tabId = `catalogs:${connection.id}`;
    const unsubscribe = TabMessages.subscribe<any>(tabId, (message) => {
      unsubscribe();
      if (message.message === MessageType.CATALOGS) {
        lists[connection.id] = message.payload.catalogs;
        EventBus.emit(new CatalogsWereReceived(connection.id));
      }
    });
    sendServerCommand(connection, CommandType.GET_CATALOGS, {tabId});
  },
};

export default Catalogs;
