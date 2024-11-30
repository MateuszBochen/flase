import VerticalSliderPropsInterface from './Interface/VerticalSliderPropsInterface';
import {useCallback, useEffect, useRef, useState} from 'react';
import SlideItemInterface from './Interface/SlideItemInterface';
import VerticalSlideItem from './VerticalSlideItem';
import './style.css';

/** VerticalSlider */
export default (props: VerticalSliderPropsInterface) => {
  const refCurrentIndex = useRef<number>(0);
  const [state, setState] = useState<SlideItemInterface[]>(props.items.map((newSlideItem, index) => {
    return {
      ...newSlideItem,
      isActive: index === refCurrentIndex.current
    };
  }));

  useEffect(() => {
    setState(props.items.map((newSlideItem, index) => {
      return {
        ...newSlideItem,
        isActive: index === refCurrentIndex.current
      };
    }));
  }, [props.items]);

  const itemClickHandler = useCallback((index: number) => {
      const newState = state.map((stateItem, stateIndex) => {
        if (index === stateIndex) {
          refCurrentIndex.current = index;
        }
        return {
          ...stateItem,
          isActive: index === stateIndex
        }
      });

      setState(newState);

  }, [state, props]);

  return (
    <div className="vertical-slider-root">
      <ul>
        {state.map((slideItem, index) => {
          return (
            <VerticalSlideItem
              key={slideItem.label}
              index={index}
              onClick={itemClickHandler}
              slider={slideItem}
            />
          );
        })}
      </ul>
    </div>
  );
}
