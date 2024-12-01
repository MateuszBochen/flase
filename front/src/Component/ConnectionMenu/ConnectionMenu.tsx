import ConnectionMenuPropsInterface from './ConnectionMenuPropsInterface';
import InvisibleButton from '../../UI/Button/InvisibleButton';
import {faDatabase, faSatelliteDish, faInfoCircle, faMicrochip, faUsersRectangle} from '@fortawesome/free-solid-svg-icons';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import React, {useCallback, useEffect, useState} from 'react';
import HorizontalButtonList from '../../UI/Button/HorizontalButtonList';
import Popup from '../../UI/Popup/Popup';
import ConnectionForm from '../ConnectionForm/ConnectionForm';
import EventBus from '../../Library/EventBus/EventBus';
import ConnectionWasEstablished from '../../Library/Connection/Event/ConnectionWasEstablished';
import ConnectionManager from '../../Library/Connection/ConnectionManager';

/** Connection manger */
const connectionManger = ConnectionManager.getInstance();
const connectedColor = '#b1dc14';

/** ConnectionMenu */
export default (props: ConnectionMenuPropsInterface) => {
  const [connectPopup, setConnectPopup] = useState<boolean>(false);
  const [connectionIsActive, setConnectionIsActive] = useState<boolean>(connectionManger.checkIfConnectionIsActive(props.connectionData));

  const handleCloseConnectionDialog = useCallback(() => {
    setConnectPopup(false);
  }, [connectPopup]);

  const handleOpenConnectionDialog = useCallback(() => {
    setConnectPopup(true);
  }, [connectPopup]);

  useEffect(() => {
    /** Close connection popup if connection was established */
    EventBus.subscribe(ConnectionWasEstablished.name, () => {
      handleCloseConnectionDialog();
    });

  }, [connectPopup]);

  useEffect(() => {
    // connection status checker
    const interValId = setInterval(() => {
      setConnectionIsActive(connectionManger.checkIfConnectionIsActive(props.connectionData));
    }, 1000);

    return () => {
      clearInterval(interValId);
    }

  }, [props.connectionData, connectionIsActive]);



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
          onClickWheel={() => {}}
          onClickLeft={() => {}}
        >
          <FontAwesomeIcon icon={faDatabase} />
        </InvisibleButton>

        <InvisibleButton
          tooltip={connectionIsActive ? 'Connected, click for disconnect' : 'Click to connect to database'}
          onClickWheel={handleOpenConnectionDialog}
          onClickLeft={handleOpenConnectionDialog}
          position={'end'}
          disabled={connectionIsActive}
        >
          <FontAwesomeIcon icon={faSatelliteDish} color={connectionIsActive ? connectedColor : undefined} />
        </InvisibleButton>
      </HorizontalButtonList>
      <Popup
        isOpen={connectPopup}
        label={`Connect to ${props.connectionData.displayName}`}
        onClickOk={handleCloseConnectionDialog}
      >
        <ConnectionForm
          connectionData={props.connectionData}
        />
      </Popup>
    </div>
  );
}
