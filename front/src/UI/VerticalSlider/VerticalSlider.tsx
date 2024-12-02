import VerticalSliderPropsInterface from './Interface/VerticalSliderPropsInterface';
import {useCallback, useEffect, useRef, useState} from 'react';
import SlideItemInterface from './Interface/SlideItemInterface';
import VerticalSlideItem from './VerticalSlideItem';
import './style.css';

/** VerticalSlider */
export default (props: VerticalSliderPropsInterface) => {
  const refCurrentIndex = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  /** default state */
  const [state, setState] = useState<SlideItemInterface[]>(props.items.map((newSlideItem, index) => {
    return {
      ...newSlideItem,
      isActive: props.automateOpenFirst === false ? false : index === refCurrentIndex.current
    };
  }));

  useEffect(() => {
    console.log('VerticalSlider');
    if (containerRef.current) {
      containerRef.current.style.height = `calc(100% - ${containerRef.current.offsetTop + 3}px`;
    }
  }, []);

  useEffect(() => {
    setState(props.items.map((newSlideItem, index) => {
      return {
        ...newSlideItem,
        isActive: props.automateOpenFirst === false ? false : index === refCurrentIndex.current
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
          isActive: index === stateIndex && (props?.allowClose === true ? !stateItem.isActive : true),
        }
      });

      setState(newState);

  }, [state, props]);

  return (
    <div className="vertical-slider-root" ref={containerRef}>
      <ul>
        {state.length === 0 ? (props.labelIfEmpty || 'No results') : ''}
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
