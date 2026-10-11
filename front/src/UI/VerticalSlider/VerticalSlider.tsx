import VerticalSliderPropsInterface from './Interface/VerticalSliderPropsInterface';
import {useCallback, useEffect, useRef, useState} from 'react';
import SlideItemInterface from './Interface/SlideItemInterface';
import VerticalSlideItem from './VerticalSlideItem';
import './style.css';
import Box from '../Box/Box';

const itemId = (item: {id?: string, label: string}) => item.id ?? item.label;

const loadOpen = (storageKey?: string): Set<string> => {
  if (!storageKey) return new Set();
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return new Set(Array.isArray(stored) ? stored : []);
  } catch (e) {
    return new Set();
  }
};

const saveOpen = (storageKey: string | undefined, open: Set<string>) => {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(Array.from(open)));
  } catch (e) {
    // not remembered (storage blocked)
  }
};

/** VerticalSlider */
export default (props: VerticalSliderPropsInterface) => {
  /** multiple: ids of opened items - kept when items change (new, renamed, recolored item) */
  const [open, setOpen] = useState<Set<string>>(() => loadOpen(props.storageKey));
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
      // open items kept by id (multiple, or remembered accordion)
      if (props.multiple || props.storageKey) {
        const id = itemId(state[index]);
        setOpen((previous) => {
          let next: Set<string>;
          if (previous.has(id)) {
            next = new Set(previous);
            if (props.multiple || props.allowClose) next.delete(id);
          } else {
            next = props.multiple ? new Set(previous).add(id) : new Set([id]);
          }
          saveOpen(props.storageKey, next);
          return next;
        });
        return;
      }
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
    <Box maxPossibleHeight={true} className="vertical-slider-root" possibleHeightOffset={3}>
      <ul>
        {state.length === 0 ? (props.labelIfEmpty || 'No results') : ''}
        {state.map((slideItem, index) => {
          return (
            <VerticalSlideItem
              key={itemId(slideItem)}
              index={index}
              onClick={itemClickHandler}
              slider={props.multiple || props.storageKey ? {...slideItem, isActive: open.has(itemId(slideItem))} : slideItem}
            />
          );
        })}
      </ul>
    </Box>
  );
}
