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
}

export default VerticalSliderPropsInterface;
