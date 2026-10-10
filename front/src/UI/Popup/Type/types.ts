import React from 'react';
import {TypeIconButton} from '../../Button/Type/types';


export type TypePopupProps = {
  isOpen: boolean;
  children: React.ReactNode;
  label: string;
  onClickOk: () => void;
  buttons?: TypeIconButton[],
}
