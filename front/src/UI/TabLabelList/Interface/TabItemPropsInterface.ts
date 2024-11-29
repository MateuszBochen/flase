
/**
 * Props interface for TabItem
 * @author Mateusz Bochen
 */
interface TabItemPropsInterface {
  label: string;
  isActive: boolean;
  index: number;
  onClick: (index: number) => void;
  onClose: (index: number) => void;
  key: number;
}

export default TabItemPropsInterface;
