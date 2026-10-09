import VerticalSliderItem from './VerticalSliderItem';

interface VerticalSliderPropsInterface {
  items: VerticalSliderItem[];
  labelIfEmpty?: string;
  allowClose?:boolean;
  automateOpenFirst?: boolean;
  /** every item is opened / closed by user independently (otherwise opening one closes the others) */
  multiple?: boolean;
  /** multiple: open items are remembered in browser under this key */
  storageKey?: string;
}

export default VerticalSliderPropsInterface;
