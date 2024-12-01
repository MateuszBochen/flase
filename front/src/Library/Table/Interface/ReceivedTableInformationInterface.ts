import TableInformationInterface from './TableInformationInterface';
import ConnectionDataInterface from '../../Connection/Interface/ConnectionDataInterface';


interface ReceivedTableInformationInterface {
  tableInformation: TableInformationInterface;
  connection: ConnectionDataInterface;
}

export default ReceivedTableInformationInterface;
