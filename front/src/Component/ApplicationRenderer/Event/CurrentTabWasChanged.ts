import EventInterface from '../../../Library/EventBus/EventInterface';

/**
 * Event trigger when some change current tab.
 * @author Mateusz Bochen
 */
class CurrentTabWasChanged implements EventInterface<number> {
  private readonly tabNumber: number;

  constructor(newTabNumber: number) {
    this.tabNumber = newTabNumber;
  }

  getData(): number {
    return this.tabNumber;
  }
}

export default CurrentTabWasChanged;
