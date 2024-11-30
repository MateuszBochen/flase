import React, {ReactElement} from "react";
import {IconProp} from "@fortawesome/fontawesome-svg-core";
import {TypeColorVariant} from '../../Colors/types';


export type TypeButtonSize = 'normal' | 'small' | 'wide' | 'sp50';

export type TypeButtonGroupProps = {
  children: React.ReactNode,
  size?: TypeButtonSize,
}


export type TypeIconButton = ReactElement;

export type TypeButtonProps = {
  size?: TypeButtonSize,
  colorVariant?: TypeColorVariant,
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void,
  label: string,
  disabled?: boolean,
  loading?: boolean,
  dangerDelay?: boolean,
}

export type TypeSwitchProps = {
  onChange: (isChecked: boolean) => void,
  defaultChecked?: boolean,
} & Omit<TypeButtonProps, 'onClick'>;


export type TypeIconButtonProps = {
  icon: IconProp,

} & Omit<TypeButtonProps, 'label'>;
