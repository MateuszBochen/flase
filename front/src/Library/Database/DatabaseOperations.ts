import ConnectionManager from '../Connection/ConnectionManager';
import ConnectionDataInterface from '../Connection/Interface/ConnectionDataInterface';
import CommandType from '../WebSocket/Enum/CommandType';
import {ObjectRefInterface} from './Interface/DatabaseObjectsInterface';
import {DatabaseOperationRequestInterface} from './Interface/DatabaseOperationInterface';

const send = (connection: ConnectionDataInterface, command: CommandType, payload: any) => {
  ConnectionManager.getInstance().sendCommand(connection, command, payload);
};

/** commands of database overview - answers are messages with the same tabId */
const DatabaseOperations = {
  /** answer DATABASE_OBJECTS */
  objects: (connection: ConnectionDataInterface, database: string, tabId: string) => send(connection, CommandType.GET_DATABASE_OBJECTS, {tabId, database}),
  /** answer SERVER_OPTIONS */
  serverOptions: (connection: ConnectionDataInterface, tabId: string) => send(connection, CommandType.GET_SERVER_OPTIONS, {tabId}),
  /** answer OBJECT_DDL */
  objectDdl: (connection: ConnectionDataInterface, database: string, object: ObjectRefInterface, tabId: string) => send(connection, CommandType.GET_OBJECT_DDL, {tabId, database, object}),
  /** answer DATABASE_OPERATION_PREVIEW (dryRun) or DATABASE_OPERATION_APPLIED */
  operation: (connection: ConnectionDataInterface, request: DatabaseOperationRequestInterface) => send(connection, CommandType.DATABASE_OPERATION, request),
};

export default DatabaseOperations;
