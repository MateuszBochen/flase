import React from 'react';
import {TypeIconButton} from '../../Button/Type/types';


export type TypePopupProps = {
  /** opened when mounted - popup rendered by parent only while it has data to show */
  openOnMount?: boolean;
  children: React.ReactNode;
  label: string;
  onClickOk: () => void;
  /** popup was closed - Escape, click outside, close() of ref */
  onClose?: () => void;
  buttons?: TypeIconButton[],
}

/** open / close without state (and render) of parent */
export interface PopupRefInterface {
  open: () => void;
  close: () => void;
}
