import SlideItemInterface from './SlideItemInterface';

interface VerticalSlideItemPropsInterface {
  onClick: (index: number) => void;
  slider: SlideItemInterface;
  key: string;
  index: number;
}
export default VerticalSlideItemPropsInterface;

