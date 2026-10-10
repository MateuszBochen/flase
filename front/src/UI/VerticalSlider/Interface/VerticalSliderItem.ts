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
}

export default VerticalSliderItem;
