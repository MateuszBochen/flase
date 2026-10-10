import React, {CSSProperties} from 'react';

interface BoxPropsInterface {
  children: React.ReactNode;
  maxPossibleHeight?: boolean;
  possibleHeightOffset?: number;
  className?: string;
  key?: string|number;
  style?:CSSProperties;
}

export default BoxPropsInterface;
