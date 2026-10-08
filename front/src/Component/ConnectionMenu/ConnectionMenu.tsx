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

/** Connection manger */
const connectionManger = ConnectionManager.getInstance();


/** ConnectionMenu */
export default (props: ConnectionMenuPropsInterface) => {
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const handleLoadDatabaseList = useCallback(() => {
    try {
      DatabaseManger.getInstance().aksForDatabaseList(connectionManger.getEstablishedConnection(props.connectionData));
    } catch (e) {
      toast.error('Unable to load database list');
    }
  }, [props.connectionData]);

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
