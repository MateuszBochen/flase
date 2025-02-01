import EventInterface from '../../../../Library/EventBus/EventInterface';
import PaginationDataInterface from '../Interface/PaginationDataInterface';




/**
 * Event trigger when page was changed
 */
class PageWasChanged implements EventInterface<PaginationDataInterface> {

  private readonly pageNumber: number;
  private readonly perPage: number;
  private readonly tabId: string;

  constructor(tabId: string, pageNumber: number, perPage: number, maxPages: number) {
    this.tabId = tabId;
    this.perPage = perPage;
    if (pageNumber < 0) {
      this.pageNumber = 0;
    } else {
      this.pageNumber = Math.min(pageNumber, maxPages);
    }
  }

  getData(): PaginationDataInterface {
    return {
      page: this.pageNumber,
      perPage: this.perPage,
      tabId: this.tabId,
    }
  }

}

export default PageWasChanged
