import Box from '../../UI/Box/Box';
import TableListPropsInterface from './Interface/TableListPropsInterface';
import React, {useCallback, useEffect, useState} from 'react';
import toast from 'react-hot-toast';
import TableInformationInterface from '../../Library/Table/Interface/TableInformationInterface';
import TableItem from './TableItem';
import TabOpener from '../TabOpener/TabOpener';
import DatabaseSearch, {DatabaseSearchPropsInterface} from '../Application/DatabaseSearch/DatabaseSearch';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faDiagramProject, faMagnifyingGlass, faRightLeft, faTerminal, faTableList, faSquarePlus, faWandMagicSparkles} from '@fortawesome/free-solid-svg-icons';
import ErDiagram, {ErDiagramPropsInterface} from '../Application/ErDiagram/ErDiagram';
import TransferTab, {TransferTabPropsInterface} from '../Application/Transfer/TransferTab';
import SqlConsole, {SqlConsolePropsInterface} from '../Application/SqlConsole/SqlConsole';
import DatabaseOverview, {DatabaseOverviewPropsInterface} from '../Application/DatabaseOverview/DatabaseOverview';
import CreateTable, {CreateTablePropsInterface} from '../Application/CreateTable/CreateTable';
import QueryBuilder, {QueryBuilderPropsInterface} from '../Application/QueryBuilder/QueryBuilder';
import ContextMenu, {ContextMenuItem} from '../../UI/ContextMenu/ContextMenu';
import EventBus from '../../Library/EventBus/EventBus';
import NewTabComponentWasSelected from '../ApplicationRenderer/Event/NewTabComponentWasSelected';
import TableManager from '../../Library/Table/TableManager';
import DriverFactory from '../../Library/Database/Driver/DriverFactory';
import useConnectionSettings from '../../Library/Connection/useConnectionSettings';
import openTableTab from '../Application/TableRecords/openTableTab';
import useStructureChange from '../Application/TableRecords/Structure/useStructureChange';
import TableNameForm from '../Application/TableRecords/Structure/TableNameForm';
import SqlConfirmPopup from '../Application/TableRecords/Structure/SqlConfirmPopup';
import useDatabaseOperation from '../DatabaseOperations/useDatabaseOperation';
import {maintenanceActions} from '../DatabaseOperations/MaintenanceResultsPopup';
import {MaintenanceActionType} from '../../Library/Database/Interface/DatabaseOperationInterface';

type MenuState = {x: number, y: number, table: string} | null;

/** TableList */
export default (props: TableListPropsInterface) => {
  const [state, setState] = useState<TableInformationInterface[]>(props.tables);
  const [filter, setFilter] = useState<string>('');
  const [menu, setMenu] = useState<MenuState>(null);
  const [nameForm, setNameForm] = useState<{mode: 'rename' | 'copy', table: string} | null>(null);
  const connection = useConnectionSettings(props.connection);
  const database = props.database.name;
  const reloadTables = () => TableManager.getInstance().askForTableList(props.connection, props.database, true);

  /** rename / copy of table */
  const tableChange = useStructureChange(props.connection, {databaseName: database, name: nameForm?.table || ''}, `sidebar-table:${props.connection.id}:${database}`, (applied) => {
    setNameForm(null);
    reloadTables();
    if (applied.kind === 'copy' || applied.kind === 'rename') {
      openTableTab(props.connection, {databaseName: database, name: applied.newName}, {newTab: true});
    }
  });
  /** truncate / drop (also of views) and maintenance */
  const operation = useDatabaseOperation(props.connection, `sidebar-tables:${props.connection.id}:${database}`, (applied) => {
    if (applied.kind === 'tables') reloadTables();
  });

  const menuItems = (table: string): ContextMenuItem[] => {
    const readOnly = !!connection.readOnly;
    return [
      {label: 'Open', onClick: () => openTableTab(props.connection, {databaseName: database, name: table}, {newTab: false})},
      {label: 'Open in new tab', onClick: () => openTableTab(props.connection, {databaseName: database, name: table}, {newTab: true})},
      'separator',
      {label: 'Rename…', disabled: readOnly, onClick: () => setNameForm({mode: 'rename', table})},
      {label: 'Copy…', disabled: readOnly, onClick: () => setNameForm({mode: 'copy', table})},
      {label: 'Truncate…', danger: true, disabled: readOnly, onClick: () => operation.run({kind: 'tables', action: 'truncate', database, tables: [table], ignoreForeignKeys: false})},
      {label: 'Drop…', danger: true, disabled: readOnly, onClick: () => operation.run({kind: 'tables', action: 'drop', database, tables: [table], ignoreForeignKeys: false})},
      'separator',
      {
        label: 'Maintenance',
        disabled: readOnly,
        children: maintenanceActions(DriverFactory.getDriver(props.connection).dialect).map((item) => ({
          label: item.label,
          hint: item.hint.split(' - ')[0],
          onClick: () => operation.run({kind: 'maintenance', action: item.action as MaintenanceActionType, database, tables: [table]}),
        })),
      },
      {
        label: 'Export…',
        onClick: () => EventBus.emit(new NewTabComponentWasSelected<TransferTabPropsInterface>({
          component: TransferTab,
          props: {connection: props.connection, database, table},
          tabName: `Import / export: ${database}.${table}`,
          isActive: false,
          activate: true,
        })),
      },
      {label: 'Copy name', onClick: () => navigator.clipboard?.writeText(table).then(() => toast.success('Copied'))},
    ];
  };

  useEffect(() => {
    setState(props.tables);
  }, [props.tables]);

  /** comma separates alternatives: "ord, cust" */
  const compare = useCallback((input: string, filter: string):boolean => {
    const splitFilter = filter.split(',');
    for (const key in splitFilter) {
      if (input.trim().toLowerCase().includes(splitFilter[key].trim())) {
        return true;
      }
    }
    return false;
  }, []);

  return (
    <Box maxPossibleHeight={true}>
      <div
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault()
        }}
      >
        <div className="table-list-filter">
          <input
            type="text"
            className="form-control"
            value={filter}
            placeholder="Filter tables…"
            onChange={(e) => setFilter(e.target.value.toLowerCase())}
          />
          <TabOpener<DatabaseOverviewPropsInterface>
            tooltip={`Overview of ${props.database.name} - tables, routines, triggers, events`}
            tab={{
              component: DatabaseOverview,
              props: {connection: props.connection, database: props.database.name},
              tabName: `${props.database.name}: overview`,
              isActive: false,
            }}
          >
            <FontAwesomeIcon icon={faTableList} />
          </TabOpener>
          {!connection.readOnly && (
            <TabOpener<CreateTablePropsInterface>
              tooltip={`New table in ${props.database.name}`}
              tab={{
                component: CreateTable,
                props: {connection: props.connection, database: props.database.name},
                tabName: `${props.database.name}: new table`,
                isActive: false,
              }}
            >
              <FontAwesomeIcon icon={faSquarePlus} />
            </TabOpener>
          )}
          <TabOpener<DatabaseSearchPropsInterface>
            tooltip={`Search in data of ${props.database.name}`}
            tab={{
              component: DatabaseSearch,
              props: {connection: props.connection, database: props.database},
              tabName: `Search: ${props.database.name}`,
              isActive: false,
            }}
          >
            <FontAwesomeIcon icon={faMagnifyingGlass} />
          </TabOpener>
          <TabOpener<SqlConsolePropsInterface>
            tooltip={`SQL console for ${props.database.name}`}
            tab={{
              component: SqlConsole,
              props: {connection: props.connection, database: props.database.name},
              tabName: `Console: ${props.database.name}`,
              isActive: false,
            }}
          >
            <FontAwesomeIcon icon={faTerminal} />
          </TabOpener>
          <TabOpener<TransferTabPropsInterface>
            tooltip={`Import / export ${props.database.name}`}
            tab={{
              component: TransferTab,
              props: {connection: props.connection, database: props.database.name},
              tabName: `Import / export: ${props.database.name}`,
              isActive: false,
            }}
          >
            <FontAwesomeIcon icon={faRightLeft} />
          </TabOpener>
          <TabOpener<QueryBuilderPropsInterface>
            tooltip={`Query builder for ${props.database.name}`}
            tab={{
              component: QueryBuilder,
              props: {connection: props.connection, database: props.database.name},
              tabName: `Query builder: ${props.database.name}`,
              isActive: false,
            }}
          >
            <FontAwesomeIcon icon={faWandMagicSparkles} />
          </TabOpener>
          <TabOpener<ErDiagramPropsInterface>
            tooltip={`ER diagram of ${props.database.name}`}
            tab={{
              component: ErDiagram,
              props: {connection: props.connection, database: props.database.name},
              tabName: `ER: ${props.database.name}`,
              isActive: false,
            }}
          >
            <FontAwesomeIcon icon={faDiagramProject} />
          </TabOpener>
        </div>
        <ul>
          {state.filter((tableItem) => compare(tableItem.tableName, filter)).map((filteredItem) =>(
            <TableItem
              connection={props.connection}
              database={props.database}
              table={filteredItem}
              key={filteredItem.tableName}
              onContextMenu={(event, table) => setMenu({x: event.clientX, y: event.clientY, table: table.tableName})}
            />
          ))}
        </ul>
      </div>
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.table)} onClose={() => setMenu(null)} />}
      {nameForm && (
        <TableNameForm
          mode={nameForm.mode}
          currentName={nameForm.table}
          busy={tableChange.busy}
          onCancel={() => setNameForm(null)}
          onPreview={(newName, withData) => tableChange.requestPreview(nameForm.mode === 'copy' ? {kind: 'copy', newName, withData} : {kind: 'rename', newName})}
        />
      )}
      {tableChange.preview && (
        <SqlConfirmPopup
          statements={tableChange.preview.statements}
          change={tableChange.preview.change}
          busy={tableChange.busy}
          onExecute={tableChange.execute}
          onCancel={tableChange.closePreview}
        />
      )}
      {operation.element}
    </Box>
  );
}
