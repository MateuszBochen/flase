
interface TabLabelListPropsInterface {
  labels: string [];
  /** color of connection of the tab */
  colors?: (string | undefined)[];
  activeIndex: number;
  onLabelClick: (index: number) => void;
  onLabelClose: (index: number) => void;
}

export default TabLabelListPropsInterface;
