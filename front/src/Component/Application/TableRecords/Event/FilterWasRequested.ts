import EventInterface from '../../../../Library/EventBus/EventInterface';

export type FilterRequestType = {
  tabId: string;
  /** condition added to current WHERE with AND, null clears the filter */
  condition: string | null;
};

/**
 * trigger when filter of tab was requested from grid (quick filter of cell)
 * @author Mateusz Bochen
 */
class FilterWasRequested implements EventInterface<FilterRequestType> {
  private readonly data: FilterRequestType;

  constructor(data: FilterRequestType) {
    this.data = data;
  }

  getData(): FilterRequestType {
    return this.data;
  }
}

export default FilterWasRequested;
