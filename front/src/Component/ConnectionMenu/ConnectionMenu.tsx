import ConnectionMenuPropsInterface from './Interface/ConnectionMenuPropsInterface';
import InvisibleButton from '../../UI/Button/InvisibleButton';
import {faDatabase, faSatelliteDish, faInfoCircle, faMicrochip, faUsersRectangle} from '@fortawesome/free-solid-svg-icons';
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
  const handleLoadDatabaseList = useCallback(() => {
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
        <InvisibleButton
          tooltip={"Load database list"}
          onClickWheel={handleLoadDatabaseList}
          onClickLeft={handleLoadDatabaseList}
        >
          <FontAwesomeIcon icon={faDatabase} />
        </InvisibleButton>
        <ConnectionControlIcon connectionData={props.connectionData} />
      </HorizontalButtonList>
      <DatabaseListMenu connection={props.connectionData} />
      {settingsOpen && <ConnectionSettingsPopup connection={props.connectionData} onClose={() => setSettingsOpen(false)} />}
    </Box>
  );
}
