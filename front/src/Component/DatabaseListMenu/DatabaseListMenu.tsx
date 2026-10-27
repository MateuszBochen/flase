import DatabaseManger from '../../Library/Database/DatabaseManger';
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import toast from 'react-hot-toast';
import ConnectionManager from '../../Library/Connection/ConnectionManager';
import DatabaseListMenuPropsInterface from './DatabaseListMenuPropsInterface';
import EventBus from '../../Library/EventBus/EventBus';
import DatabaseWasReceived from '../../Library/Database/Event/DatabaseWasReceived';
import DatabaseListWasReloaded from '../../Library/Database/Event/DatabaseListWasReloaded';
import VerticalSliderItem from '../../UI/VerticalSlider/Interface/VerticalSliderItem';
import VerticalSlider from '../../UI/VerticalSlider/VerticalSlider';
import TableListMenu from '../TableListMenu/TableListMenu';
import Box from '../../UI/Box/Box';
import ContextMenu, {ContextMenuItem} from '../../UI/ContextMenu/ContextMenu';
import DriverFactory from '../../Library/Database/Driver/DriverFactory';
import TableManager from '../../Library/Table/TableManager';
import useConnectionSettings from '../../Library/Connection/useConnectionSettings';
import NewTabComponentWasSelected from '../ApplicationRenderer/Event/NewTabComponentWasSelected';
import useDatabaseOperation from '../DatabaseOperations/useDatabaseOperation';
import DatabaseFormPopup, {DatabaseFormModeType} from '../DatabaseOperations/DatabaseFormPopup';
import openConsole from '../DatabaseOperations/openConsole';
import {createTableTab, overviewTab} from '../Application/DatabaseOverview/DatabaseOverview';
import TransferTab from '../Application/Transfer/TransferTab';
import DatabaseSearch from '../Application/DatabaseSearch/DatabaseSearch';
import ErDiagram from '../Application/ErDiagram/ErDiagram';
import QueryBuilder from '../Application/QueryBuilder/QueryBuilder';
import SchemaCompare from '../Application/SchemaCompare/SchemaCompare';
import groupedItems from '../../UI/VerticalSlider/groupedItems';
import DatabaseGrouping, {useDatabaseGrouping} from '../../Library/Database/DatabaseGrouping';

const connectionManger = ConnectionManager.getInstance();
const databaseManger = DatabaseManger.getInstance();

/** database or group of databases with the same prefix */
type MenuState = {x: number, y: number, database: string, group?: boolean} | null;

/** DatabaseListMenu */
export default (props: DatabaseListMenuPropsInterface) => {
  const connection = useConnectionSettings(props.connection);
  const [state, setState] = useState<VerticalSliderItem[]>([]);
  const [menu, setMenu] = useState<MenuState>(null);
  const [form, setForm] = useState<{mode: DatabaseFormModeType, database: string} | null>(null);
  const driver = DriverFactory.getDriver(props.connection);
  const label = driver.features.databaseLabel;
  const grouping = useDatabaseGrouping(props.connection.id);
  const storageKey = `open-database:${props.connection.id}`;
  const items = useMemo(() => groupedItems(state, {
    enabled: grouping,
    storageKey,
    fold: `${label.toLowerCase()}s`,
    onGroupContextMenu: (event, prefix) => setMenu({x: event.clientX, y: event.clientY, database: prefix, group: true}),
  }), [state, grouping, storageKey, label]);

  const operation = useDatabaseOperation(props.connection, `sidebar:${props.connection.id}`, () => {
    setForm(null);
    databaseManger.reloadDatabaseList(props.connection);
  });

  const convertToVerticalSliderItem = useCallback(() => {
    const establishedConnection = connectionManger.getEstablishedConnection(props.connection);
    const list = databaseManger.getListOfDatabaseForConnection(establishedConnection);

    setState(list.map((databaseItem) => {
      return {
        label: databaseItem.name,
        component: <TableListMenu connection={props.connection} database={databaseItem} key={databaseItem.name} />,
        onContextMenu: (event: React.MouseEvent) => setMenu({x: event.clientX, y: event.clientY, database: databaseItem.name}),
      };
    }));

  }, [props, state]);

  useEffect(() => {
    try {
      convertToVerticalSliderItem();
    } catch (e) {}
  }, []);

  useEffect(() => {
    const refresh = () => {
      try {
        convertToVerticalSliderItem();
      } catch (e) {}
    };
    const databaseWasReceivedSubscriber = EventBus.subscribe(DatabaseWasReceived.name, refresh);
    const reloadedSubscriber = EventBus.subscribe(DatabaseListWasReloaded.name, refresh);

    return () => {
      EventBus.unSub(databaseWasReceivedSubscriber);
      EventBus.unSub(reloadedSubscriber);
    }

  }, [props, state]);

  const openTab = (tab: any) => EventBus.emit(new NewTabComponentWasSelected({...tab, isActive: false, activate: true}));

  const groupingItem: ContextMenuItem = {
    label: grouping ? `Do not group ${label.toLowerCase()}s by prefix` : `Group ${label.toLowerCase()}s by prefix`,
    onClick: () => DatabaseGrouping.setEnabled(props.connection.id, !grouping),
  };

  const menuItems = (database: string, group?: boolean): ContextMenuItem[] => {
    const readOnly = !!connection.readOnly;
    if (group) {
      return [groupingItem, {label: 'Copy prefix', onClick: () => navigator.clipboard?.writeText(database).then(() => toast.success('Copied'))}];
    }
    return [
      {label: 'Overview', onClick: () => openTab(overviewTab(props.connection, database))},
      {label: 'New table…', disabled: readOnly, onClick: () => openTab(createTableTab(props.connection, database))},
      {label: 'SQL console', onClick: () => openConsole(props.connection, database)},
      {label: 'Import / export', onClick: () => openTab({component: TransferTab, props: {connection: props.connection, database}, tabName: `Import / export: ${database}`})},
      {label: 'Search in data', onClick: () => openTab({component: DatabaseSearch, props: {connection: props.connection, database: {name: database}}, tabName: `Search: ${database}`})},
      {label: 'Query builder', onClick: () => openTab({component: QueryBuilder, props: {connection: props.connection, database}, tabName: `Query builder: ${database}`})},
      {label: 'ER diagram', onClick: () => openTab({component: ErDiagram, props: {connection: props.connection, database}, tabName: `ER: ${database}`})},
      {label: 'Compare schema…', onClick: () => openTab({component: SchemaCompare, props: {connection: props.connection, database}, tabName: `Compare: ${database}`})},
      'separator',
      {label: 'Reload tables', onClick: () => TableManager.getInstance().askForTableList(props.connection, {name: database}, true)},
      'separator',
      ...(driver.dialect === 'mysql' ? [{label: 'Change collation…', disabled: readOnly, onClick: () => setForm({mode: 'collation', database})} as ContextMenuItem] : []),
      {label: `Rename ${label.toLowerCase()}…`, disabled: readOnly, onClick: () => setForm({mode: 'rename', database})},
      {label: `Drop ${label.toLowerCase()}…`, danger: true, disabled: readOnly, onClick: () => operation.run({kind: 'dropDatabase', name: database})},
      'separator',
      {label: 'Copy name', onClick: () => navigator.clipboard?.writeText(database).then(() => toast.success('Copied'))},
      groupingItem,
    ];
  };

  return (
    <>
      {state.length > 0 && (
        <Box maxPossibleHeight={true}>
          <VerticalSlider
            items={items}
            allowClose={true}
            automateOpenFirst={false}
            // opened database survives reload of page
            storageKey={storageKey}
            fold={`${label.toLowerCase()}s`}
          />
        </Box>
      )}
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menuItems(menu.database, menu.group)} onClose={() => setMenu(null)} />}
      {form && (
        <DatabaseFormPopup
          connection={props.connection}
          mode={form.mode}
          database={form.database}
          busy={operation.busy}
          onPreview={operation.run}
          onCancel={() => setForm(null)}
        />
      )}
      {operation.element}
    </>
  );
}
