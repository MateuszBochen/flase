import React from 'react';

interface VerticalSliderItem {
  /** stable identity (e.g. id of connection) - open state survives rename; label is used without it */
  id?: string;
  label: string;
  component: React.ReactNode;
  /** colored stripe before label */
  color?: string;
  /** shown after label, e.g. icon */
  suffix?: React.ReactNode;
  /** right click on item (not on its opened content) */
  onContextMenu?: (event: React.MouseEvent) => void;
  /** arrow showing that item opens / closes */
  chevron?: boolean;
  /** item is a group of other items (e.g. databases of the same prefix) */
  group?: boolean;
}

export default VerticalSliderItem;
