
/**
 * Props interface for TabItem
 * @author Mateusz Bochen
 */
interface TabItemPropsInterface {
  label: string;
  color?: string;
  isActive: boolean;
  /** tab is dragged to other place */
  isDragged?: boolean;
  /** horizontal move while some tab is dragged (px) */
  shift?: number;
  index: number;
  onClick: (index: number) => void;
  onClose: (index: number) => void;
  onDragStart?: (index: number, clientX: number) => void;
  key: number;
}

export default TabItemPropsInterface;
