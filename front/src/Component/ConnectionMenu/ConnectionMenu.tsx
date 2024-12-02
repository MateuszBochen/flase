import ConnectionMenuPropsInterface from './ConnectionMenuPropsInterface';
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
    <div>
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
        <InvisibleButton
          tooltip={"Processlist"}
          onClickWheel={() => {}}
          onClickLeft={() => {}}
        >
          <FontAwesomeIcon icon={faMicrochip} />
        </InvisibleButton>
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
    </div>
  );
}
