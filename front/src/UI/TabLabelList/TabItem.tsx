import {MouseEvent, useCallback} from 'react';
import TabItemPropsInterface from './Interface/TabItemPropsInterface';

export default (props: TabItemPropsInterface) => {

  const onMousedownHandler = useCallback((event: MouseEvent<HTMLLIElement>): void => {
    switch (event.button) {
      case 0:
        props.onClick(props.index);
        break;
      case 1:
        props.onClose(props.index);
        break;
      default:
        break;
    }
  }, []);

  const onCloseHandler = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    props.onClose(props.index);
  }, []);

  return (
    <li
      className={`tab-label-list-item ${props.isActive ? 'active' : ''}`}
      onMouseDown={onMousedownHandler}
    >
      {props.label}
      <button
        className="close-tab"
        onMouseDown={onCloseHandler}
      >
        <span className="close-tab-icon">
            X
        </span>
      </button>
    </li>
  );
}
