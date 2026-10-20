import {MouseEvent, useCallback} from 'react';
import TabItemPropsInterface from './Interface/TabItemPropsInterface';

export default (props: TabItemPropsInterface) => {

  const onMousedownHandler = useCallback((event: MouseEvent<HTMLLIElement>): void => {
    switch (event.button) {
      case 0:
        props.onClick(props.index);
        props.onDragStart?.(props.index, event.clientX);
        break;
      case 1:
        props.onClose(props.index);
        break;
      default:
        break;
    }
  }, [props.index, props.onClick, props.onClose, props.onDragStart]);

  const onCloseHandler = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    event.preventDefault();
    props.onClose(props.index);
  }, [props.index, props.onClose]);

  return (
    <li
      className={`tab-label-list-item ${props.isActive ? 'active' : ''} ${props.color ? 'colored' : ''} ${props.isDragged ? 'dragged' : ''}`}
      style={{
        ...(props.color ? {borderTopColor: props.color} : {}),
        ...(props.shift ? {transform: `translateX(${props.shift}px)`} : {}),
      }}
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
