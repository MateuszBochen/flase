import VerticalSliderItem from './VerticalSliderItem';

interface VerticalSliderPropsInterface {
  items: VerticalSliderItem[];
  labelIfEmpty?: string;
  allowClose?:boolean;
  automateOpenFirst?: boolean;
}

export default VerticalSliderPropsInterface;
