import React, {InputHTMLAttributes} from 'react';

export type TypeInputPros = {
  label: string;
  name?: string;
  type?: 'text'|'password'|'number';
  onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  errors?: string[];
  isInvalid?: boolean;
  marginBottom?: number;
  inputProps?: InputHTMLAttributes<HTMLInputElement>
}


export interface InterfaceErrorBoxProps {
  errors?: string[];
}
