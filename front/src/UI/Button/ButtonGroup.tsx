import React from 'react';
import {TypeButtonGroupProps} from './Type/types';


import './style/style.css';


const ButtonGroup = (props: TypeButtonGroupProps) => {
  return <div className={`button-group-root ${props.size}`}>
    {props.children}
  </div>
}

export default ButtonGroup;
