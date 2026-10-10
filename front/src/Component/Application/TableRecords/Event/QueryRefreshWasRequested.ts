import EventInterface from '../../../../Library/EventBus/EventInterface';

/**
 * trigger to run current query of tab again, e.g. after rows were saved
 * @author Mateusz Bochen
 */
class QueryRefreshWasRequested implements EventInterface<string> {

  private readonly tabId: string;

  constructor(tabId: string) {
    this.tabId = tabId;
  }

  getData(): string {
    return this.tabId;
  }
}

export default QueryRefreshWasRequested;
