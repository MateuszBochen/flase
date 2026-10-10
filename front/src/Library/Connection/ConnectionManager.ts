import ConnectionWasUpdated from './Event/ConnectionWasUpdated';
import EventBus from '../EventBus/EventBus';
import ConnectionFormWasSubmitted from '../../Component/ConnectionForm/Event/ConnectionFormWasSubmitted';
import EventInterface from '../EventBus/EventInterface';
import ConnectionRequestInterface from './Interface/ConnectionRequestInterface';
import ConnectionWasEstablished from './Event/ConnectionWasEstablished';
import LoginRequest from '../API/Request/LoginRequest';
import toast from 'react-hot-toast';
import ConnectionRequestWasRejected from './Event/ConnectionRequestWasRejected';
import EstablishedUser from './Interface/EstablishedUser';
import EstablishedConnectionInterface from './Interface/EstablishedConnectionInterface';
import ConnectionDataInterface from './Interface/ConnectionDataInterface';
import ConnectionSettings from './ConnectionSettings';
import WebSocketApiClient from '../WebSocket/WebSocketApiClient';
import LoopThrough from '../Loop/LoopThrough';
import WebsocketConnectionWasClosed from '../WebSocket/Event/WebsocketConnectionWasClosed';
import DisconnectRequest from '../API/Request/DisconnectRequest';
import WebsocketReceivedAMessage from '../WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../WebSocket/Interface/MessageInterface';
import MessageType from '../WebSocket/Enum/MessageType';
import QueryErrorInterface from '../Record/Interface/QueryErrorInterface';
import WebsocketConnectionWasLost from '../WebSocket/Event/WebsocketConnectionWasLost';
import WebsocketConnectionWasRestored from '../WebSocket/Event/WebsocketConnectionWasRestored';
import RefreshTokenRequest from '../API/Request/RefreshTokenRequest';
import JwtExpiration from './JwtExpiration';

/** next try when token refresh failed because of network */
const REFRESH_RETRY_MS = 10 * 1000;


/**
 * database connection manager
 * @author Mateusz Bochen
 */
class ConnectionManager {
  private static instance: ConnectionManager

  private readonly listOfEstablishedConnections: {[key:string]: EstablishedConnectionInterface} = {};
  private readonly listOfApiConnections: {[key:string]: WebSocketApiClient} = {};
  /** key is connection id */
  private readonly refreshTimers: {[key:string]: ReturnType<typeof setTimeout>} = {};

  /** function get instance of connection manager */
  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }

    return ConnectionManager.instance;
  }

  /** private constructor - do not allow for create second new object */
  private constructor() {
    this.listOfEstablishedConnections = ConnectionSettings.getInstance().getEstablishedConnection();

    /** commands carry connection of login - it must have current settings (read only) */
    EventBus.subscribe(ConnectionWasUpdated.name, (event: EventInterface<ConnectionDataInterface>) => {
      const established = this.listOfEstablishedConnections[event.getData().id];
      if (established && established.connection !== event.getData()) {
        Object.assign(established.connection, event.getData());
      }
    });

    /** Event subscriber for handle event of connection form submit */
    EventBus.subscribe(ConnectionFormWasSubmitted.name, (event: EventInterface<ConnectionRequestInterface>) => {
      this.connect(event.getData());
    });

    /** Event subscriber for handle event of connection of api was closed */
    EventBus.subscribe<EstablishedConnectionInterface>(WebsocketConnectionWasClosed.name, (event: EventInterface<EstablishedConnectionInterface>) => {
      this.disconnect(event.getData());
    });

    /** connection to server was lost, client reconnects automatically */
    EventBus.subscribe<EstablishedConnectionInterface>(WebsocketConnectionWasLost.name, (event) => {
      const connection = event.getData().connection;
      toast.loading(`Connection to server lost (${connection.displayName}), reconnecting…`, {id: `ws-${connection.id}`});
    });

    EventBus.subscribe<EstablishedConnectionInterface>(WebsocketConnectionWasRestored.name, (event) => {
      const connection = event.getData().connection;
      toast.success(`Reconnected to server (${connection.displayName})`, {id: `ws-${connection.id}`});
    });

    /** every server side error is shown to the user, tab errors are displayed also in the grid */
    EventBus.subscribe<MessageInterface<QueryErrorInterface>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.message === MessageType.QUERY_ERROR) {
        toast.error(message.payload.error);
      }
    });

    LoopThrough.loop<EstablishedConnectionInterface>(this.listOfEstablishedConnections).subscribe((establishedConnection: EstablishedConnectionInterface) => {
      this.connectWithApi(establishedConnection);
    });
  }

  menage = () => {

  }

  /** connect function */
  connect(data: ConnectionRequestInterface) {
    new LoginRequest().login(data).then((establishedUser: EstablishedUser) => {
      toast.success('Connection was Established successfully');

      const establishedConnection = {
        user: establishedUser,
        connection: data.connectionData,
      };

      this.listOfEstablishedConnections[data.connectionData.id] = establishedConnection;
      ConnectionSettings.getInstance().addNewEstablishedConnection(establishedConnection);
      this.connectWithApi(establishedConnection);

      /** inform application about connection */
      EventBus.emit(new ConnectionWasEstablished());
    }).catch((e) => {
      const reason = e?.response?.data?.error;
      toast.error(reason ? `Connection request rejected: ${reason}` : 'Connection request rejected!');
      EventBus.emit(new ConnectionRequestWasRejected());
    });
  }

  /** disconnect function - server session is closed, user must log in again */
  /** notify false - disconnect requested by user, no warning toast */
  disconnect(establishedConnection: EstablishedConnectionInterface, notify: boolean = true): void {
    const id = establishedConnection.connection.id;

    // close and remove from apis list
    this.listOfApiConnections[id]?.close();
    delete this.listOfApiConnections[id];
    clearTimeout(this.refreshTimers[id]);
    delete this.refreshTimers[id];

    // remove from list of EstablishedConnections
    delete this.listOfEstablishedConnections[id];

    ConnectionSettings.getInstance().saveNewListOfEstablishedConnection(this.listOfEstablishedConnections);

    if (notify) {
      toast.error(`Connection ${establishedConnection.connection.displayName} was closed, log in again`, {id: `ws-${id}`});
    }

    new DisconnectRequest().disconnect(establishedConnection);
  }

  /** checking if connection is still active */
  checkIfConnectionIsActive(data: ConnectionDataInterface): boolean {
    return !!this.listOfEstablishedConnections[data.id];
  }

  getEstablishedConnection(data: ConnectionDataInterface): EstablishedConnectionInterface {
    if (this.listOfEstablishedConnections[data.id]) {
      return this.listOfEstablishedConnections[data.id];
    }
    throw Error('Established Connection Connection not found');
  }

  getClientForConnection(connectionData: EstablishedConnectionInterface): WebSocketApiClient {
    if (this.listOfApiConnections[connectionData.connection.id]) {
      return this.listOfApiConnections[connectionData.connection.id];
    }
    this.disconnect(connectionData);
    throw Error('Client not found established connection');
  }

  private connectWithApi(connectionData: EstablishedConnectionInterface) {
    const id = connectionData.connection.id;
    // connecting again (new login) - old client must not keep reconnecting
    this.listOfApiConnections[id]?.close();
    try {
      this.listOfApiConnections[id] = new WebSocketApiClient(connectionData);
    } catch (e) {
    }
    this.scheduleTokenRefresh(connectionData);
  }

  /** token is refreshed before it expires, so session lives as long as application is open */
  private scheduleTokenRefresh(connectionData: EstablishedConnectionInterface, delay?: number) {
    const id = connectionData.connection.id;
    clearTimeout(this.refreshTimers[id]);

    const refreshAt = JwtExpiration.refreshAt(connectionData.user.token);
    if (refreshAt === null) {
      return;
    }

    this.refreshTimers[id] = setTimeout(() => this.refreshToken(connectionData), delay ?? Math.max(0, refreshAt - Date.now()));
  }

  private refreshToken(connectionData: EstablishedConnectionInterface) {
    const id = connectionData.connection.id;
    // connection was closed meanwhile
    if (this.listOfEstablishedConnections[id] !== connectionData) {
      return;
    }

    new RefreshTokenRequest().refresh(connectionData.user).then((user: EstablishedUser) => {
      // the same object is used by websocket client and commands - mutate, do not replace
      connectionData.user.token = user.token;
      ConnectionSettings.getInstance().addNewEstablishedConnection(connectionData);
      this.scheduleTokenRefresh(connectionData);
    }).catch((e) => {
      if (e?.response?.status === 401) {
        // session expired or server was restarted
        this.disconnect(connectionData);
        return;
      }
      // server not reachable - try again while token is still valid
      const times = JwtExpiration.read(connectionData.user.token);
      if (times && times.expiresAt > Date.now()) {
        this.scheduleTokenRefresh(connectionData, REFRESH_RETRY_MS);
      }
    });
  }
}

export default ConnectionManager;
