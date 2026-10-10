import EstablishedUser from '../../Connection/Interface/EstablishedUser';
import ConnectionDataInterface from '../../Connection/Interface/ConnectionDataInterface';

interface CommandConnectionInterface {
  user: EstablishedUser;
  connection: ConnectionDataInterface;
}

export default CommandConnectionInterface;
