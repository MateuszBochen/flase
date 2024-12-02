
import VerticalSlideItemPropsInterface from './Interface/VerticalSlideItemPropsInerface';
import React, {useCallback, useEffect} from 'react';

/* VerticalSlideItem */
export default (props: VerticalSlideItemPropsInterface) => {

  const onClickHandler = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    event.preventDefault();

    props.onClick(props.index)
  }, [props]);

  return (
    <li
      className={`vertical-slider-item ${props.slider.isActive ? 'active' : ''}`}
      onClick={onClickHandler}
    >
      {props.slider.label}
      <div className="vertical-slider-item-component">
        {props.slider.isActive ? props.slider.component : null}
      </div>
    </li>
  );
}

