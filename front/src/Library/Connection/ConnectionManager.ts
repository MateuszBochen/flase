import EventBus from '../EventBus/EventBus';
import ConnectionFormWasSubmitted from '../../Component/ConnectionForm/Event/ConnectionFormWasSubmitted';
import EventInterface from '../EventBus/EventInterface';
import ConnectionRequestInterface from './Interface/ConnectionRequestInterface';
import ConnectionWasEstablished from './Event/ConnectionWasEstablished';
import LoginRequest from '../API/Request/LoginRequest';
import toast from 'react-hot-toast';
import ConnectionRequestWasRejected from './Event/ConnectionRequestWasRejected';


/**
 * database connection manager
 * @author Mateusz Bochen
 */
class ConnectionManager {
  private static instance: ConnectionManager

  public static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }

    return ConnectionManager.instance;
  }


  constructor() {

    /** Event subscriber for handle event of connection form submit */
    EventBus.subscribe(ConnectionFormWasSubmitted.name, (event: EventInterface<ConnectionRequestInterface>) => {
      new LoginRequest().login(event.getData()).then(() => {
        console.log('success');
        toast.success('Connection was Established successfully');
        EventBus.emit(new ConnectionWasEstablished());
      }).catch(() => {
        console.log('fail');
        toast.error('Connection request rejected!');
        EventBus.emit(new ConnectionRequestWasRejected());
      });


      //console.log(event);
      //EventBus.emit(new ConnectionWasEstablished());
    });

  }

  menage = () => {

  }
}

export default ConnectionManager;
