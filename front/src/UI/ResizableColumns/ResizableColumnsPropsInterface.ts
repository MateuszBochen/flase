import React, {CSSProperties} from 'react';

/**
 * Interface of left menu component
 * @author Mateusz Bochen
 */
interface ResizableColumnsPropsInterface {
  leftSide?: React.ReactNode;
  rightSide?: React.ReactNode;
  name: string;
  styleLeft?: CSSProperties | undefined;
  styleRight?: CSSProperties | undefined;
}

export default ResizableColumnsPropsInterface;
