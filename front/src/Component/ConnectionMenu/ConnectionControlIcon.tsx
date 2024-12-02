import {faSatelliteDish} from '@fortawesome/free-solid-svg-icons';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import React, {useCallback, useEffect, useState} from 'react';
import ConnectionManager from '../../Library/Connection/ConnectionManager';
import ConnectionControlIconPropsInterface from './Interface/ConnectionControlIconPropsInterface';
import InvisibleButton from '../../UI/Button/InvisibleButton';
import ConnectionForm from '../ConnectionForm/ConnectionForm';
import Popup from '../../UI/Popup/Popup';
import EventBus from '../../Library/EventBus/EventBus';
import ConnectionWasEstablished from '../../Library/Connection/Event/ConnectionWasEstablished';

const connectionManger = ConnectionManager.getInstance();

const connectedColor = '#b1dc14';

/** ConnectionControlIcon */
export default (props: ConnectionControlIconPropsInterface) => {
  const [connectionIsActive, setConnectionIsActive] = useState<boolean>(connectionManger.checkIfConnectionIsActive(props.connectionData));
  const [connectPopup, setConnectPopup] = useState<boolean>(false);

  useEffect(() => {
    // connection status checker
    const interValId = setInterval(() => {
      setConnectionIsActive(connectionManger.checkIfConnectionIsActive(props.connectionData));
    }, 1000);

    return () => {
      clearInterval(interValId);
    }

  }, [props.connectionData, connectionIsActive]);

  const handleCloseConnectionDialog = useCallback(() => {
    setConnectPopup(false);
  }, [connectPopup]);



  useEffect(() => {
    /** Close connection popup if connection was established */
    const connectionWasEstablished = EventBus.subscribe(ConnectionWasEstablished.name, () => {
      handleCloseConnectionDialog();
    });

    return () => {
      EventBus.unSub(connectionWasEstablished);
    }

  }, [connectPopup]);

  const handleOpenConnectionDialog = useCallback(() => {
    setConnectPopup(true);
  }, [connectPopup]);

  return (
    <>
      <InvisibleButton
        tooltip={connectionIsActive ? 'Connected, click for disconnect' : 'Click to connect to database'}
        onClickWheel={handleOpenConnectionDialog}
        onClickLeft={handleOpenConnectionDialog}
        position={'end'}
        disabled={connectionIsActive}
        className={connectionIsActive ? 'is-connect' : ''}
      >
        <FontAwesomeIcon icon={faSatelliteDish} color={connectionIsActive ? connectedColor : undefined} />
      </InvisibleButton>
      <Popup
        isOpen={connectPopup}
        label={`Connect to ${props.connectionData.displayName}`}
        onClickOk={handleCloseConnectionDialog}
      >
        <ConnectionForm
          connectionData={props.connectionData}
        />
      </Popup>
    </>
  );
}
