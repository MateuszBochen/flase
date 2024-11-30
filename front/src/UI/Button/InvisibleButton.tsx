import InvisibleButtonPropsInterface from './InvisibleButtonPropsInterface';
import {MouseEvent, useCallback} from 'react';
import './style/style.css';

/** InvisibleButton */
export default (props: InvisibleButtonPropsInterface) => {

  const onMousedownHandler = useCallback((event: MouseEvent<HTMLButtonElement>): void => {
    switch (event.button) {
      case 0:
        props.onClickLeft(event);
        break;
      case 1:
        props.onClickWheel(event);
        break;
      default:
        break;
    }
  }, [props.onClickLeft, props.onClickWheel]);

  return (
    <button
      className={`invisible-button-root ${props.position}`}
      onMouseDown={onMousedownHandler}
      title={props.tooltip}
    >
      {props.children}
    </button>
  );
}
