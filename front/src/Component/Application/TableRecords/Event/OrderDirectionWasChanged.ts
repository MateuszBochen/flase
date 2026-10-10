import EventInterface from '../../../../Library/EventBus/EventInterface';
import SortDirectionDataInterface from '../Interface/SortDirectionDataInterface';

class OrderDirectionWasChanged implements EventInterface<SortDirectionDataInterface>
{
  private readonly data: SortDirectionDataInterface;

  constructor(data: SortDirectionDataInterface) {
    this.data = data;
  }

  getData(): SortDirectionDataInterface {
    return this.data;
  };
}


export default OrderDirectionWasChanged;
