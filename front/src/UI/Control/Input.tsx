import React from 'react';
import {TypeInputPros} from './Type/types';

import './style/style.css';
import './style/theme.css';
import ErrorBox from './ErrorBox';

const Input = (props: TypeInputPros) => {
  const id = `input-${Date.now()}-${Math.random()}`;

  const type = props.type || 'text';
  const error = props.isInvalid ? 'error' : '';
  const errorMessage = props.errors?.length ? props.errors[0] : undefined;
  const marginBottom = props?.marginBottom !== undefined ? props?.marginBottom : 20;

  const style = {
    marginBottom: `${marginBottom}px`,
  }

  return (
    <div
      className={`control control-input-root`}
      style={style}
    >
      <div className="label-wrapper">
        <label htmlFor={id}>
          <span></span>
          {props.label}:
        </label>
      </div>
      <input type={type} id={id} {...props.inputProps}/>
      <ErrorBox errors={props.errors} />
    </div>
  );
}

export default Input;
