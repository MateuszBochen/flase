import EventBus from '../../Library/EventBus/EventBus';
import ConnectionDataInterface from '../../Library/Connection/Interface/ConnectionDataInterface';
import NewTabComponentWasSelected from '../ApplicationRenderer/Event/NewTabComponentWasSelected';
import SqlConsole, {SqlConsolePropsInterface} from '../Application/SqlConsole/SqlConsole';

/** SQL console of database in new tab, optionally with statements (executed at once with autoRun) */
const openConsole = (
  connection: ConnectionDataInterface,
  database: string | null,
  options: {sql?: string, autoRun?: boolean, tabName?: string} = {},
) => EventBus.emit(new NewTabComponentWasSelected<SqlConsolePropsInterface>({
  component: SqlConsole,
  props: {connection, database, initialSql: options.sql, autoRun: options.autoRun},
  tabName: `Console: ${options.tabName || database || connection.displayName}`,
  isActive: false,
  activate: true,
}));

export default openConsole;
