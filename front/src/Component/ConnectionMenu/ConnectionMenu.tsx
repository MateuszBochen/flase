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

/** Connection manger */
const connectionManger = ConnectionManager.getInstance();


/** ConnectionMenu */
export default (props: ConnectionMenuPropsInterface) => {
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
          tooltip={"Connection details"}
          onClickWheel={() => {}}
          onClickLeft={() => {}}
        >
          <FontAwesomeIcon icon={faInfoCircle} />
        </InvisibleButton>
        <InvisibleButton
          tooltip={"Users accounts"}
          onClickWheel={() => {}}
          onClickLeft={() => {}}
        >
          <FontAwesomeIcon icon={faUsersRectangle} />
        </InvisibleButton>
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
    </Box>
  );
}
