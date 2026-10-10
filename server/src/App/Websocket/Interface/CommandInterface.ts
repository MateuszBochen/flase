import CommandType from '../Enum/CommandType';
import CommandConnectionInterface from './CommandConnectionInterface';

interface CommandInterface {
  connectionData: CommandConnectionInterface;
  command: CommandType;
  payload: any
}

export default CommandInterface;
