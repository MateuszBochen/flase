import EventInterface from '../../../Library/EventBus/EventInterface';

/**
 * Trigger when tab was closed
 * @author Mateusz Bochen
 */
class TabWasClosed implements EventInterface<number> {
  private readonly tabNumber: number;

  constructor(newTabNumber: number) {
    this.tabNumber = newTabNumber;
  }

  getData(): number {
    return this.tabNumber;
  }
}

export default TabWasClosed;
