import EventInterface from '../../../../Library/EventBus/EventInterface';
import QueryRequestDataInterface from '../../../../Library/Record/Interface/QueryRequestDataInterface';

/**
 * trigger when query will be changed
 * @author Mateusz Bochen
 */
class QueryWasChanged implements EventInterface<QueryRequestDataInterface> {

  private readonly data: QueryRequestDataInterface;

  constructor(data: QueryRequestDataInterface) {
    this.data = data;
  }

  getData(): QueryRequestDataInterface {
    return this.data;
  }
}

export default QueryWasChanged;
