import React from 'react';

interface VerticalSliderItem {
  label: string;
  component: React.ReactNode;
  /** colored stripe before label */
  color?: string;
  /** shown after label, e.g. icon */
  suffix?: React.ReactNode;
}

export default VerticalSliderItem;
