
import VerticalSlideItemPropsInterface from './Interface/VerticalSlideItemPropsInerface';
import React, {useCallback, useRef} from 'react';

/* VerticalSlideItem */
export default (props: VerticalSlideItemPropsInterface) => {

  const componentRef = useRef<HTMLDivElement | null>(null);

  const onClickHandler = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    // clicks in opened content (menu, list of databases) do not open / close the item
    if (componentRef.current?.contains(event.target as Node)) {
      return;
    }
    event.preventDefault();

    props.onClick(props.index)
  }, [props]);

  return (
    <li
      className={`vertical-slider-item ${props.slider.isActive ? 'active' : ''} ${props.slider.color ? 'colored' : ''}`}
      style={props.slider.color ? {borderLeftColor: props.slider.color} : undefined}
      onClick={onClickHandler}
    >
      <span className="vertical-slider-label" style={props.slider.color ? {color: props.slider.color} : undefined}>{props.slider.label}</span>
      {props.slider.suffix}
      <div className="vertical-slider-item-component" ref={componentRef}>
        {props.slider.isActive ? props.slider.component : null}
      </div>
    </li>
  );
}

