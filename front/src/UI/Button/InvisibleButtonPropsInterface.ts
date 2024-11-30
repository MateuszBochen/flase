import React, {MouseEvent} from 'react';


interface InvisibleButtonPropsInterface {
  children: React.ReactNode;
  onClickLeft: (event: MouseEvent<HTMLButtonElement>) => void;
  onClickWheel: (event: MouseEvent<HTMLButtonElement>) => void;
}

export default InvisibleButtonPropsInterface;
