import {faSatelliteDish} from '@fortawesome/free-solid-svg-icons';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import WebsocketReceivedAMessage from '../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../Library/WebSocket/Interface/MessageInterface';
import ConnectionManager from '../../Library/Connection/ConnectionManager';
import ConnectionControlIconPropsInterface from './Interface/ConnectionControlIconPropsInterface';
import InvisibleButton from '../../UI/Button/InvisibleButton';
import ConnectionForm from '../ConnectionForm/ConnectionForm';
import Popup from '../../UI/Popup/Popup';
import EventBus from '../../Library/EventBus/EventBus';
import ConnectionWasEstablished from '../../Library/Connection/Event/ConnectionWasEstablished';

const connectionManger = ConnectionManager.getInstance();

const connectedColor = '#589df6';
/** websocket of connection received a message - icon blinks */
const activityColor = '#b1dc14';
const ACTIVITY_MS = 250;

/** ConnectionControlIcon */
export default (props: ConnectionControlIconPropsInterface) => {
  const [connectionIsActive, setConnectionIsActive] = useState<boolean>(connectionManger.checkIfConnectionIsActive(props.connectionData));
  const [connectPopup, setConnectPopup] = useState<boolean>(false);
  const [activity, setActivity] = useState<boolean>(false);
  const activityTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // green while messages of this connection come (rows of big result keep it on)
  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      if (event.getData().connection?.id !== props.connectionData.id) return;
      setActivity(true);
      clearTimeout(activityTimer.current);
      activityTimer.current = setTimeout(() => setActivity(false), ACTIVITY_MS);
    });
    return () => {
      EventBus.unSub(eventId);
      clearTimeout(activityTimer.current);
    };
  }, [props.connectionData.id]);

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
        tooltip={connectionIsActive ? 'Connected (green = data are coming), disconnect in connection settings' : 'Click to connect to database'}
        onClickWheel={handleOpenConnectionDialog}
        onClickLeft={handleOpenConnectionDialog}
        position={'end'}
        disabled={connectionIsActive}
        className={connectionIsActive ? 'is-connect' : ''}
      >
        <FontAwesomeIcon icon={faSatelliteDish} color={connectionIsActive ? (activity ? activityColor : connectedColor) : undefined} />
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
