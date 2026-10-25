import VerticalSliderItem from './VerticalSliderItem';

interface VerticalSliderPropsInterface {
  items: VerticalSliderItem[];
  labelIfEmpty?: string;
  allowClose?:boolean;
  automateOpenFirst?: boolean;
  /** every item is opened / closed by user independently (otherwise opening one closes the others) */
  multiple?: boolean;
  /** open items are remembered in browser under this key (also one open item of accordion) */
  storageKey?: string;
  /** every change closes all items (button "collapse all") */
  collapseSignal?: number;
  /**
   * name of items (e.g. "databases") - when an item is open and closed items would take much of sidebar,
   * closed items around it are folded into one row "⋯ 12 databases"
   */
  fold?: string;
}

export default VerticalSliderPropsInterface;
