import React, {CSSProperties} from 'react';

/**
 * Interface of left menu component
 * @author Mateusz Bochen
 */
interface HorizontalResizableColumnPropsInterface {
  children: React.ReactNode;
  name: string;
  style?: CSSProperties | undefined;
}

export default HorizontalResizableColumnPropsInterface;
