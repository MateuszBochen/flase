import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import TableInterface from '../../../Library/Table/Interface/TableInterface';
import TableManager from '../../../Library/Table/TableManager';
import TableInformationInterface from '../../../Library/Table/Interface/TableInformationInterface';
import EventBus from '../../../Library/EventBus/EventBus';
import NewTabComponentWasSelected from '../../ApplicationRenderer/Event/NewTabComponentWasSelected';
import CurrentTabComponentWasSelected from '../../ApplicationRenderer/Event/CurrentTabComponentWasSelected';
import TabInterface from '../../ApplicationRenderer/Interface/TabInterface';
import TableRecordsPropsInterface from './Interface/TableRecordsPropsInterface';
import TableRecords from './TableRecords';
import {TableViewType} from './Interface/QueryPlacePropsInterface';

/** open table records of given table, optionally with own query */
const openTableTab = (
  connection: ConnectionDataInterface,
  table: TableInterface,
  /** activate - new tab is shown at once, otherwise it is opened in background */
  options: {query?: string, newTab: boolean, activate?: boolean, view?: TableViewType},
) => {
  const known = TableManager.getInstance()
    .getTablesListForDatabase(connection, {name: table.databaseName})
    .find((tableItem) => tableItem.tableName === table.name);
  const tableInformation: TableInformationInterface = known || {
    tableName: table.name,
    dataBaseName: table.databaseName,
    preload: false,
    columns: [],
    primaryColumns: [],
    uniqueColumns: [],
  };

  const tab: TabInterface<TableRecordsPropsInterface> = {
    component: TableRecords,
    props: {connection, database: {name: table.databaseName}, table: tableInformation, initialQuery: options.query, initialView: options.view},
    tabName: `${table.databaseName}/${table.name}`,
    isActive: false,
    activate: options.activate,
  };

  EventBus.emit(options.newTab ? new NewTabComponentWasSelected(tab) : new CurrentTabComponentWasSelected(tab));
};

export default openTableTab;
