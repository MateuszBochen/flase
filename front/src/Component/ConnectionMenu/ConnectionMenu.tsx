import ConnectionMenuPropsInterface from './Interface/ConnectionMenuPropsInterface';
import InvisibleButton from '../../UI/Button/InvisibleButton';
import {faDatabase, faSatelliteDish, faInfoCircle, faMicrochip, faUsersRectangle, faSquarePlus, faGauge, faCompress} from '@fortawesome/free-solid-svg-icons';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import React, {useCallback, useEffect, useState} from 'react';
import HorizontalButtonList from '../../UI/Button/HorizontalButtonList';
import ConnectionManager from '../../Library/Connection/ConnectionManager';
import './style.css';
import DatabaseListMenu from '../DatabaseListMenu/DatabaseListMenu';
import DatabaseManger from '../../Library/Database/DatabaseManger';
import toast from 'react-hot-toast';
import ConnectionControlIcon from './ConnectionControlIcon';
import Box from '../../UI/Box/Box';
import TabOpener from '../TabOpener/TabOpener';
import ProcessList, {ProcessListPropsInterface} from '../Application/ProcessList/ProcessList';
import SqlConsole, {SqlConsolePropsInterface} from '../Application/SqlConsole/SqlConsole';
import {faTerminal} from '@fortawesome/free-solid-svg-icons';
import ConnectionSettingsPopup from '../ConnectionSettings/ConnectionSettingsPopup';
import UserManager, {UserManagerPropsInterface} from '../Application/Users/UserManager';
import EventBus from '../../Library/EventBus/EventBus';
import ConnectionWasEstablished from '../../Library/Connection/Event/ConnectionWasEstablished';
import useDatabaseOperation from '../DatabaseOperations/useDatabaseOperation';
import DatabaseFormPopup from '../DatabaseOperations/DatabaseFormPopup';
import DriverFactory from '../../Library/Database/Driver/DriverFactory';
import NewTabComponentWasSelected from '../ApplicationRenderer/Event/NewTabComponentWasSelected';
import {overviewTab} from '../Application/DatabaseOverview/DatabaseOverview';
import useConnectionSettings from '../../Library/Connection/useConnectionSettings';
import Catalogs from '../../Library/Connection/Catalogs';
import CatalogListMenu from '../CatalogListMenu/CatalogListMenu';
import ServerStatus, {ServerStatusPropsInterface} from '../Application/ServerStatus/ServerStatus';

/** Connection manger */
const connectionManger = ConnectionManager.getInstance();

/** connections with loaded list of databases - loaded again after reload of page */
const LOADED_KEY = 'loaded-database-lists';
const loadedLists = (): string[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(LOADED_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch (e) {
    return [];
  }
};
const rememberLoaded = (id: string) => {
  try {
    const list = loadedLists();
    if (!list.includes(id)) localStorage.setItem(LOADED_KEY, JSON.stringify([...list, id]));
  } catch (e) {
    // not remembered
  }
};


/** ConnectionMenu */
export default (props: ConnectionMenuPropsInterface) => {
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [createOpen, setCreateOpen] = useState<boolean>(false);
  /** closes all open databases of server */
  const [collapseSignal, setCollapseSignal] = useState<number>(0);
  const connection = useConnectionSettings(props.connectionData);
  const createDatabase = useDatabaseOperation(props.connectionData, `create-database:${props.connectionData.id}`, (operation) => {
    setCreateOpen(false);
    if (operation.kind !== 'createDatabase') return;
    rememberLoaded(props.connectionData.id);
    DatabaseManger.getInstance().reloadDatabaseList(props.connectionData);
    EventBus.emit(new NewTabComponentWasSelected(overviewTab(props.connectionData, operation.name)));
  });
  /** PostgreSQL without database in DSN - databases of server, each with its schemas */
  const withCatalogs = Catalogs.hasCatalogs(props.connectionData);
  const handleLoadDatabaseList = useCallback(() => {
    if (withCatalogs) {
      Catalogs.load(props.connectionData);
      rememberLoaded(props.connectionData.id);
      return;
    }
    try {
      DatabaseManger.getInstance().aksForDatabaseList(connectionManger.getEstablishedConnection(props.connectionData));
      rememberLoaded(props.connectionData.id);
    } catch (e) {
      toast.error('Unable to load database list');
    }
  }, [props.connectionData]);

  // list of databases was shown before reload of page - loaded again now or when connection is established
  useEffect(() => {
    const restore = () => {
      if (!loadedLists().includes(props.connectionData.id)) return;
      if (withCatalogs) {
        if (connectionManger.checkIfConnectionIsActive(props.connectionData) && !Catalogs.listOf(props.connectionData)) Catalogs.load(props.connectionData);
        return;
      }
      try {
        const established = connectionManger.getEstablishedConnection(props.connectionData);
        if (!DatabaseManger.getInstance().getListOfDatabaseForConnection(established).length) {
          DatabaseManger.getInstance().aksForDatabaseList(established);
        }
      } catch (e) {
        // not connected yet
      }
    };
    restore();
    const eventId = EventBus.subscribe(ConnectionWasEstablished.name, restore);
    return () => EventBus.unSub(eventId);
  }, [props.connectionData.id]);

  return (
    <Box maxPossibleHeight={true}>
      <HorizontalButtonList>
        <InvisibleButton
          tooltip={"Connection settings - name, color, read only"}
          onClickWheel={() => setSettingsOpen(true)}
          onClickLeft={() => setSettingsOpen(true)}
        >
          <FontAwesomeIcon icon={faInfoCircle} />
        </InvisibleButton>
        <TabOpener<UserManagerPropsInterface>
          tooltip={"Users and privileges"}
          tab={{component: UserManager, props: {connection: props.connectionData}, tabName: `Users: ${props.connectionData.displayName}`, isActive: false}}
        >
          <FontAwesomeIcon icon={faUsersRectangle} />
        </TabOpener>
        <TabOpener<ServerStatusPropsInterface>
          tooltip={"Server status, variables and advisor"}
          tab={{component: ServerStatus, props: {connection: props.connectionData}, tabName: `Server: ${props.connectionData.displayName}`, isActive: false}}
        >
          <FontAwesomeIcon icon={faGauge} />
        </TabOpener>
        <TabOpener<ProcessListPropsInterface>
          tooltip={"Processlist"}
          tab={{component: ProcessList, props: {connection: props.connectionData}, tabName: `Processes: ${props.connectionData.displayName}`, isActive: false}}
        >
          <FontAwesomeIcon icon={faMicrochip} />
        </TabOpener>
        <TabOpener<SqlConsolePropsInterface>
          tooltip={"SQL console"}
          tab={{component: SqlConsole, props: {connection: props.connectionData, database: null}, tabName: `Console: ${props.connectionData.displayName}`, isActive: false}}
        >
          <FontAwesomeIcon icon={faTerminal} />
        </TabOpener>
        {!withCatalogs && <InvisibleButton
          tooltip={connection.readOnly ? 'Read only connection' : `Create ${DriverFactory.getDriver(props.connectionData).features.databaseLabel.toLowerCase()}`}
          onClickWheel={() => !connection.readOnly && setCreateOpen(true)}
          onClickLeft={() => !connection.readOnly && setCreateOpen(true)}
        >
          <FontAwesomeIcon icon={faSquarePlus} />
        </InvisibleButton>}
        <InvisibleButton
          tooltip={withCatalogs ? 'Load databases of server' : 'Load database list'}
          onClickWheel={handleLoadDatabaseList}
          onClickLeft={handleLoadDatabaseList}
        >
          <FontAwesomeIcon icon={faDatabase} />
        </InvisibleButton>
        {withCatalogs && (
          <InvisibleButton
            tooltip="Collapse all databases"
            onClickLeft={() => setCollapseSignal((previous) => previous + 1)}
            onClickWheel={() => setCollapseSignal((previous) => previous + 1)}
          >
            <FontAwesomeIcon icon={faCompress} />
          </InvisibleButton>
        )}
        <ConnectionControlIcon connectionData={props.connectionData} />
      </HorizontalButtonList>
      {withCatalogs ? <CatalogListMenu connection={props.connectionData} collapseSignal={collapseSignal} /> : <DatabaseListMenu connection={props.connectionData} />}
      {settingsOpen && <ConnectionSettingsPopup connection={props.connectionData} onClose={() => setSettingsOpen(false)} />}
      {createOpen && (
        <DatabaseFormPopup
          connection={props.connectionData}
          mode="create"
          busy={createDatabase.busy}
          onPreview={createDatabase.run}
          onCancel={() => setCreateOpen(false)}
        />
      )}
      {createDatabase.element}
    </Box>
  );
}
