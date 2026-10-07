import QueryPlace from './UI/QueryPlace';
import Box from '../../../UI/Box/Box';

import './style/style.css';
import TableRecordsPropsInterface from './Interface/TableRecordsPropsInterface';
import GridView from './UI/GridView';
import {useCallback, useRef, useState} from 'react';
import StructureView, {StructureViewRefInterface} from './Structure/StructureView';
import TableInterface from '../../../Library/Table/Interface/TableInterface';
import TableManager from '../../../Library/Table/TableManager';
import EventBus from '../../../Library/EventBus/EventBus';
import NewTabComponentWasSelected from '../../ApplicationRenderer/Event/NewTabComponentWasSelected';
import TableInformationInterface from '../../../Library/Table/Interface/TableInformationInterface';
import {TableViewType} from './Interface/QueryPlacePropsInterface';
import TableOperations, {TableOperationsRefInterface, TableOperationType} from './Structure/TableOperations';
import {StructureChangeType} from '../../../Library/Table/Interface/StructureChangeInterface';
import QueryRefreshWasRequested from './Event/QueryRefreshWasRequested';

/** TableRecords */
const TableRecords = (props: TableRecordsPropsInterface) => {
  const [view, setView] = useState<TableViewType>('data');
  /** table does not exist under this name anymore */
  const [gone, setGone] = useState<string | null>(null);
  const structureRef = useRef<StructureViewRefInterface | null>(null);
  const operationsRef = useRef<TableOperationsRefInterface | null>(null);

  const tabId = props.tabId || '';
  const table: TableInterface = {databaseName: props.database.name, name: props.table.tableName};

  /** open other table (e.g. from foreign key, copy, rename) in new tab */
  const onOpenTable = useCallback((target: TableInterface) => {
    const known = TableManager.getInstance()
      .getTablesListForDatabase(props.connection, {name: target.databaseName})
      .find((tableItem) => tableItem.tableName === target.name);
    const tableInformation: TableInformationInterface = known || {
      tableName: target.name,
      dataBaseName: target.databaseName,
      preload: false,
      columns: [],
      primaryColumns: [],
      uniqueColumns: [],
    };

    EventBus.emit(new NewTabComponentWasSelected({
      component: TableRecords,
      props: {connection: props.connection, database: {name: target.databaseName}, table: tableInformation},
      tabName: `${target.databaseName}/${target.name}`,
      isActive: false,
    }));
  }, [props.connection]);

  const onReload = () => {
    if (view === 'data') {
      EventBus.emit<string>(new QueryRefreshWasRequested(tabId));
    } else {
      structureRef.current?.reload();
    }
  };

  /** rename / copy / truncate / drop was executed */
  const onTableOperationApplied = (change: StructureChangeType) => {
    TableManager.getInstance().askForTableList(props.connection, {name: table.databaseName}, true);
    switch (change.kind) {
      case 'truncate':
        EventBus.emit<string>(new QueryRefreshWasRequested(tabId));
        structureRef.current?.reload();
        break;
      case 'copy':
        onOpenTable({databaseName: table.databaseName, name: change.newName});
        break;
      case 'rename':
        setGone(`Table was renamed to ${change.newName}.`);
        setView('structure');
        onOpenTable({databaseName: table.databaseName, name: change.newName});
        break;
      case 'drop':
        setGone('Table was dropped.');
        setView('structure');
        break;
    }
  };

  return (
    <Box className="table-records-root">
      <QueryPlace
        database={props.database}
        connection={props.connection}
        table={props.table}
        tabId={tabId}
        view={view}
        onViewChange={setView}
        onReload={onReload}
        onTableOperation={(operation: TableOperationType) => operationsRef.current?.start(operation)}
        tableOperationsDisabled={!!gone}
      />
      <div className="table-records-body">
        {/* both views stay mounted - query, history and pending changes survive switching */}
        <div className="table-records-view" style={{display: view === 'data' ? undefined : 'none'}}>
          <GridView
            database={props.database}
            connection={props.connection}
            table={props.table}
            tabId={tabId}
          />
        </div>
        <div className="table-records-view" style={{display: view === 'structure' ? undefined : 'none'}}>
          <StructureView
            ref={structureRef}
            connection={props.connection}
            table={table}
            structureTabId={`${tabId}:structure`}
            dataTabId={tabId}
            visible={view === 'structure'}
            gone={gone}
            onOpenTable={onOpenTable}
          />
        </div>
      </div>
      <TableOperations
        ref={operationsRef}
        connection={props.connection}
        table={table}
        operationsTabId={`${tabId}:operations`}
        onApplied={onTableOperationApplied}
      />
    </Box>
  );
}

export default TableRecords;
