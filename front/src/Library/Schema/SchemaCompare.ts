import ConnectionManager from '../Connection/ConnectionManager';
import ConnectionDataInterface from '../Connection/Interface/ConnectionDataInterface';
import EstablishedConnectionInterface from '../Connection/Interface/EstablishedConnectionInterface';
import CommandType from '../WebSocket/Enum/CommandType';

export interface SchemaTableDiffInterface {
  name: string;
  /** create - only in source, drop - only in target, alter - in both and different */
  status: 'create' | 'drop' | 'alter';
  changes: string[];
  dropForeignKeys: string[];
  statements: string[];
  addForeignKeys: string[];
  /** changes which the script does not do */
  warnings: string[];
}

export interface SchemaCompareResultInterface {
  tabId?: string;
  source: string;
  target: string;
  dialect: string;
  tables: SchemaTableDiffInterface[];
  same: number;
  warnings: string[];
}

/** differences of source database and database of target connection - answer is SCHEMA_COMPARE message for tabId */
export const compareSchema = (connection: ConnectionDataInterface, tabId: string, database: string, target: EstablishedConnectionInterface, targetDatabase: string): void => {
  const manager = ConnectionManager.getInstance();
  const established = manager.getEstablishedConnection(connection);
  manager.getClientForConnection(established).sendCommand({
    connectionData: established,
    command: CommandType.COMPARE_SCHEMA,
    payload: {tabId, database, target: {token: target.user.token, database: targetDatabase}},
  });
};

/**
 * script which changes target to structure of source - for chosen tables:
 * foreign keys are dropped first (they can block changes of columns), new tables are created
 * (referenced first), then changes of tables, new foreign keys and dropped tables at the end
 */
export const migrationScript = (result: SchemaCompareResultInterface, chosen: Set<string>, title: string): string => {
  const tables = result.tables.filter((table) => chosen.has(table.name));
  const statements = [
    ...tables.flatMap((table) => table.dropForeignKeys),
    ...tables.filter((table) => table.status !== 'drop').flatMap((table) => table.statements),
    ...tables.flatMap((table) => table.addForeignKeys),
    ...tables.filter((table) => table.status === 'drop').flatMap((table) => table.statements),
  ];
  const manual = tables.flatMap((table) => table.warnings.map((warning) => `-- ${table.name}: ${warning}`));
  return `${[`-- ${title}`, ...manual].join('\n')}\n\n${statements.map((sql) => `${sql.trim().replace(/;$/, '')};`).join('\n\n')}\n`;
};
