
import VerticalSlideItemPropsInterface from './Interface/VerticalSlideItemPropsInerface';

/* VerticalSlideItem */
export default (props: VerticalSlideItemPropsInterface) => {
  return (
    <li
      className={`vertical-slider-item ${props.slider.isActive ? 'active' : ''}`}
      onClick={() => props.onClick(props.index)}
    >
      {props.slider.label}
      <div className="vertical-slider-item-component">
        {props.slider.component}
      </div>
    </li>
  );
}

