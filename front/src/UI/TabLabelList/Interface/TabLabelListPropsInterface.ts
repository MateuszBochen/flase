
interface TabLabelListPropsInterface {
  labels: string [];
  /** color of connection of the tab */
  colors?: (string | undefined)[];
  activeIndex: number;
  onLabelClick: (index: number) => void;
  onLabelClose: (index: number) => void;
  /** tab was dragged to other place */
  onLabelMove?: (from: number, to: number) => void;
}

export default TabLabelListPropsInterface;
