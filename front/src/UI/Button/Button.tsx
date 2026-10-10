import React, {useCallback, useContext, useRef, useState} from 'react';
import {TypeButtonProps} from './Type/types';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';
import './style/style.css';
import './style/theme.css';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';

const Button = (props: TypeButtonProps) => {
  const intervalId = useRef<ReturnType<typeof setInterval>|undefined>(undefined);
  const size = props.size || 'normal';
  const [overlayWidth, setOverlayWidth] = useState<number>(0);
  const disabled = props.disabled || props.loading || false;
  const loadingClass = props.loading ? 'loading' : '';
  const color = props.colorVariant || '';

  const onClickHandler = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (props.colorVariant !== 'danger' || props?.dangerDelay === false) {
      props.onClick(e)
    }
  }, [props.onClick, props.colorVariant]);

  const stopProcedure = useCallback(() => {
    if (intervalId.current) {
      clearInterval(intervalId.current);
      setOverlayWidth(0);
    }
  }, [props.onClick, props.colorVariant]);

  const startProcedure = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    if (props.colorVariant === 'danger' && props.dangerDelay !== false) {
      const delay = 150;
      let timeOut = 0;
      intervalId.current = setInterval(() => {
        timeOut += 1;
        const percent = (timeOut / delay) * 100;
        setOverlayWidth(percent);

        if (percent >= 100) {
          props.onClick(e);
          stopProcedure();
        }

      }, 1);
    }
  }, [props.onClick, props.colorVariant]);

  const nativeOnMouseDownHandler = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    startProcedure(e);
  }, [props.onClick, props.colorVariant]);

  const nativeOnMouseUpHandler = useCallback(() => {
    stopProcedure();
  }, [props.onClick, props.colorVariant]);

  return (
    <button
      className={`button main-button ${size} light ${loadingClass} ${color}`}
      onClick={onClickHandler}
      onMouseDownCapture={nativeOnMouseDownHandler}
      onMouseUpCapture={nativeOnMouseUpHandler}
      onMouseUp={nativeOnMouseUpHandler}
      onMouseLeave={nativeOnMouseUpHandler}
      disabled={disabled}
    >
      <div className="overlay" style={{width: `${overlayWidth}%`}} />
      {props.label}
      <span>
        <FontAwesomeIcon icon={faSpinner} spin />
      </span>
    </button>
  );
}


export default Button;
