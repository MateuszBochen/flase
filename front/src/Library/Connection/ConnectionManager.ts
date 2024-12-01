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


/**
 * database connection manager
 * @author Mateusz Bochen
 */
class ConnectionManager {
  private static instance: ConnectionManager

  private readonly listOfEstablishedConnections: {[key:string]: EstablishedConnectionInterface} = {};
  private readonly listOfApiConnections: {[key:string]: WebSocketApiClient} = {};

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

    /** Event subscriber for handle event of connection form submit */
    EventBus.subscribe(ConnectionFormWasSubmitted.name, (event: EventInterface<ConnectionRequestInterface>) => {
      this.connect(event.getData());
    });

    /** Event subscriber for handle event of connection of api was closed */
    EventBus.subscribe<EstablishedConnectionInterface>(WebsocketConnectionWasClosed.name, (event: EventInterface<EstablishedConnectionInterface>) => {
      this.disconnect(event.getData());
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
    }).catch(() => {
      toast.error('Connection request rejected!');
      EventBus.emit(new ConnectionRequestWasRejected());
    });
  }

  /** disconnect function */
  disconnect(establishedConnection: EstablishedConnectionInterface): void {
    // remove from apis list
    delete this.listOfApiConnections[establishedConnection.connection.id];

    // remove from list of EstablishedConnections
    delete this.listOfEstablishedConnections[establishedConnection.connection.id];

    ConnectionSettings.getInstance().saveNewListOfEstablishedConnection(this.listOfEstablishedConnections);

    toast.error(`Connection for ${establishedConnection.connection.displayName} was closed`);

    new DisconnectRequest().disconnect(establishedConnection).then(() => {
      toast.success(`Connection was clouded successfully`);
    });

  }

  /** checking if connection is still active */
  checkIfConnectionIsActive(data: ConnectionDataInterface): boolean {
    return !!this.listOfEstablishedConnections[data.id];
  }

  private connectWithApi(connectionData: EstablishedConnectionInterface) {
    try {
      this.listOfApiConnections[connectionData.connection.id] = new WebSocketApiClient(connectionData);
      console.log('api podpiete');
    } catch (e) {
      console.log('cannot connect to API');
    }
  }
}

export default ConnectionManager;
