
interface TabLabelListPropsInterface {
  labels: string [];
  activeIndex: number;
  onLabelClick: (index: number) => void;
  onLabelClose: (index: number) => void;
}

export default TabLabelListPropsInterface;
