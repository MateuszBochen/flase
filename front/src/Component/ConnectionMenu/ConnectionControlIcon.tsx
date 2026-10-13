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
import {PopupRefInterface} from '../../UI/Popup/Type/types';
import EventBus from '../../Library/EventBus/EventBus';
import ConnectionWasEstablished from '../../Library/Connection/Event/ConnectionWasEstablished';
import ConnectionRequestWasRejected from '../../Library/Connection/Event/ConnectionRequestWasRejected';
import ConnectionFormWasSubmitted from '../ConnectionForm/Event/ConnectionFormWasSubmitted';
import PasswordVault from '../../Library/Connection/PasswordVault';
import WebsocketConnectionWasLost from '../../Library/WebSocket/Event/WebsocketConnectionWasLost';
import WebsocketConnectionWasRestored from '../../Library/WebSocket/Event/WebsocketConnectionWasRestored';
import WebsocketConnectionWasClosed from '../../Library/WebSocket/Event/WebsocketConnectionWasClosed';
import EstablishedConnectionInterface from '../../Library/Connection/Interface/EstablishedConnectionInterface';

const connectionManger = ConnectionManager.getInstance();

const connectedColor = '#589df6';
/** websocket of connection received a message - icon blinks */
const activityColor = '#b1dc14';
const ACTIVITY_MS = 250;

/** ConnectionControlIcon */
export default (props: ConnectionControlIconPropsInterface) => {
  const [connectionState, setConnectionState] = useState(connectionManger.getConnectionState(props.connectionData));
  const connectionIsActive = connectionState === 'connected';
  const reconnecting = connectionState === 'reconnecting';
  const connectPopup = useRef<PopupRefInterface | null>(null);
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
    const update = () => setConnectionState(connectionManger.getConnectionState(props.connectionData));
    // websocket events change the state at once, checker covers login / logout
    const onWebsocket = (event: {getData: () => EstablishedConnectionInterface}) => {
      if (event.getData().connection.id === props.connectionData.id) update();
    };
    const events = [WebsocketConnectionWasLost.name, WebsocketConnectionWasRestored.name, WebsocketConnectionWasClosed.name]
      .map((name) => EventBus.subscribe<EstablishedConnectionInterface>(name, onWebsocket));
    const interValId = setInterval(update, 1000);
    update();

    return () => {
      clearInterval(interValId);
      events.forEach((eventId) => EventBus.unSub(eventId));
    }

  }, [props.connectionData]);

  const handleCloseConnectionDialog = useCallback(() => {
    connectPopup.current?.close();
  }, []);



  useEffect(() => {
    /** Close connection popup if connection was established */
    const connectionWasEstablished = EventBus.subscribe(ConnectionWasEstablished.name, () => {
      handleCloseConnectionDialog();
    });

    return () => {
      EventBus.unSub(connectionWasEstablished);
    }

  }, []);

  /** remembered password: connect at once, form only when the server refuses it (e.g. password was changed) */
  const handleOpenConnectionDialog = useCallback(() => {
    // lost connection - try again at once; session which does not exist anymore ends with login
    if (connectionManger.getConnectionState(props.connectionData) === 'reconnecting') {
      connectionManger.reconnect(props.connectionData);
      return;
    }
    PasswordVault.load(props.connectionData.id).then((credentials) => {
      if (!credentials) {
        connectPopup.current?.open();
        return;
      }
      const rejected = EventBus.subscribe(ConnectionRequestWasRejected.name, () => {
        EventBus.unSub(rejected);
        EventBus.unSub(established);
        connectPopup.current?.open();
      });
      const established = EventBus.subscribe(ConnectionWasEstablished.name, () => {
        EventBus.unSub(rejected);
        EventBus.unSub(established);
      });
      EventBus.emit(new ConnectionFormWasSubmitted({userData: credentials, connectionData: props.connectionData}));
    }).catch(() => connectPopup.current?.open());
  }, [props.connectionData]);

  return (
    <>
      <InvisibleButton
        tooltip={connectionIsActive
          ? 'Connected (green = data are coming), disconnect in connection settings'
          : reconnecting ? 'Connection to server was lost, reconnecting - click to try now' : 'Click to connect to database'}
        onClickWheel={handleOpenConnectionDialog}
        onClickLeft={handleOpenConnectionDialog}
        position={'end'}
        disabled={connectionIsActive}
        className={connectionIsActive ? 'is-connect' : reconnecting ? 'is-reconnecting' : ''}
      >
        <FontAwesomeIcon icon={faSatelliteDish} color={connectionIsActive ? (activity ? activityColor : connectedColor) : undefined} />
      </InvisibleButton>
      <Popup
        ref={connectPopup}
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
