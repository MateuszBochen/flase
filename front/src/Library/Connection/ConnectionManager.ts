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


/**
 * database connection manager
 * @author Mateusz Bochen
 */
class ConnectionManager {
  private static instance: ConnectionManager

  private listOfEstablishedConnections: {[key:string]: EstablishedConnectionInterface} = {};

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

      EventBus.emit(new ConnectionWasEstablished());
    }).catch(() => {
      toast.error('Connection request rejected!');
      EventBus.emit(new ConnectionRequestWasRejected());
    });
  }

  /** checking if connection is still active */
  checkIfConnectionIsActive(data: ConnectionDataInterface): boolean {
    return !!this.listOfEstablishedConnections[data.id];
  }
}

export default ConnectionManager;
