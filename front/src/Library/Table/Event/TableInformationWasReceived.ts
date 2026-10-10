import EventInterface from '../../EventBus/EventInterface';
import ReceivedTableInformationInterface from '../Interface/ReceivedTableInformationInterface';

class TableInformationWasReceived implements EventInterface<ReceivedTableInformationInterface> {
  private readonly receivedTableInformationInterface: ReceivedTableInformationInterface;
  constructor(receivedTableInformationInterface: ReceivedTableInformationInterface) {
    this.receivedTableInformationInterface = receivedTableInformationInterface;
  }

  getData(): ReceivedTableInformationInterface {
    return this.receivedTableInformationInterface;
  }
}

export default TableInformationWasReceived;
