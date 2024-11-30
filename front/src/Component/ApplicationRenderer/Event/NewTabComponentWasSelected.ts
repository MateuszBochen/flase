import TabInterface from '../Interface/TabInterface';
import EventInterface from '../../../Library/EventBus/EventInterface';

/**
 * Event when new tab was selected, but need to be open in current tab.
 * @author Mateusz Bochen
 */
class NewTabComponentWasSelected<T> implements EventInterface<TabInterface<T>>{

  private readonly tab: TabInterface<T>;

  constructor(tab: TabInterface<T>) {
    this.tab = tab;
  }

  getData(): TabInterface<T> {
    return this.tab;
  }
  
}

export default NewTabComponentWasSelected;
