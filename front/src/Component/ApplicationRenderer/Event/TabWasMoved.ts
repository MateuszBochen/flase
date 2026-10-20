import EventInterface from '../../../Library/EventBus/EventInterface';

export type TabMoveType = {from: number, to: number};

/**
 * Trigger when tab was moved to other place of tab list (dragged, shortcut)
 */
class TabWasMoved implements EventInterface<TabMoveType> {
  private readonly move: TabMoveType;

  constructor(from: number, to: number) {
    this.move = {from, to};
  }

  getData(): TabMoveType {
    return this.move;
  }
}

export default TabWasMoved;
