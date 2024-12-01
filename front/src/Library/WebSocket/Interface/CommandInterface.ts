import EstablishedConnectionInterface from '../../Connection/Interface/EstablishedConnectionInterface';
import CommandType from '../Enum/CommandType';

interface CommandInterface<T> {
  connectionData: EstablishedConnectionInterface;
  command: CommandType;
  payload: T
}

export default CommandInterface;
