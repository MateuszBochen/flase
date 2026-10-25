import VerticalSliderPropsInterface from './Interface/VerticalSliderPropsInterface';
import React, {useCallback, useEffect, useLayoutEffect, useRef, useState} from 'react';
import SlideItemInterface from './Interface/SlideItemInterface';
import VerticalSlideItem from './VerticalSlideItem';
import './style.css';
import Box from '../Box/Box';

const itemId = (item: {id?: string, label: string}) => item.id ?? item.label;

/** closed items are folded when their rows would take more than this part of sidebar */
const FOLD_SHARE = 1 / 3;
/** one or two closed items are shown - fold row would hardly save space */
const FOLD_MIN_RUN = 3;
/** names in tooltip of fold row */
const FOLD_TITLE_NAMES = 30;

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
  const listRef = useRef<HTMLUListElement | null>(null);

  /** default state */
  const [state, setState] = useState<SlideItemInterface[]>(props.items.map((newSlideItem, index) => {
    return {
      ...newSlideItem,
      isActive: props.automateOpenFirst === false ? false : index === refCurrentIndex.current
    };
  }));

  // collapse all - signal of parent
  const firstSignal = useRef(props.collapseSignal);
  useEffect(() => {
    if (props.collapseSignal === firstSignal.current) return;
    firstSignal.current = props.collapseSignal;
    const empty = new Set<string>();
    saveOpen(props.storageKey, empty);
    setOpen(empty);
    setState((previous) => previous.map((item) => ({...item, isActive: false})));
  }, [props.collapseSignal]);

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

  const shown = state.map((slideItem) => props.multiple || props.storageKey ? {...slideItem, isActive: open.has(itemId(slideItem))} : slideItem);

  /** height of sidebar and of one closed row - folding depends on them, not on lists of tables (no flicker) */
  const [sidebarHeight, setSidebarHeight] = useState<number>(0);
  const rowHeight = useRef<number>(24);
  useLayoutEffect(() => {
    if (!props.fold) return;
    const sidebar = listRef.current?.closest<HTMLElement>('.resizable-column');
    if (!sidebar) return;
    const measure = () => setSidebarHeight(sidebar.clientHeight);
    measure();
    let frame: number | null = null;
    // in next frame - state changed in callback would change layout in the same frame (ResizeObserver loop)
    const observer = new ResizeObserver(() => {
      if (frame === null) frame = requestAnimationFrame(() => { frame = null; measure(); });
    });
    observer.observe(sidebar);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [props.fold]);
  useLayoutEffect(() => {
    const closed = listRef.current?.querySelector<HTMLElement>(':scope > .vertical-slider-item:not(.active)');
    if (closed?.offsetHeight) rowHeight.current = closed.offsetHeight;
  });

  /** fold rows opened by user - folded again when other item is opened */
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set());
  const activeKey = shown.filter((item) => item.isActive).map(itemId).join('\n');
  useEffect(() => setUnfolded(new Set()), [activeKey]);

  const closedCount = shown.filter((item) => !item.isActive).length;
  const folding = !!props.fold && activeKey !== '' && sidebarHeight > 0 && closedCount * rowHeight.current > sidebarHeight * FOLD_SHARE;

  const rows: React.ReactNode[] = [];
  let run: {item: SlideItemInterface, index: number}[] = [];
  const renderItem = ({item, index}: {item: SlideItemInterface, index: number}) => (
    <VerticalSlideItem key={itemId(item)} index={index} onClick={itemClickHandler} slider={item} />
  );
  const flushRun = () => {
    const key = run.length ? itemId(run[0].item) : '';
    if (folding && run.length >= FOLD_MIN_RUN && !unfolded.has(key)) {
      const names = run.map(({item}) => item.label);
      rows.push(
        <li
          key={`fold:${key}`}
          className="vertical-slider-fold"
          title={names.slice(0, FOLD_TITLE_NAMES).join('\n') + (names.length > FOLD_TITLE_NAMES ? '\n…' : '')}
          onClick={(event) => {
            event.stopPropagation();
            setUnfolded((previous) => new Set(previous).add(key));
          }}
        >
          ⋯ {run.length} {props.fold}
        </li>,
      );
    } else {
      if (folding && run.length >= FOLD_MIN_RUN) {
        // unfolded by user - can be folded again
        rows.push(
          <li
            key={`unfold:${key}`}
            className="vertical-slider-fold unfolded"
            onClick={(event) => {
              event.stopPropagation();
              setUnfolded((previous) => {
                const next = new Set(previous);
                next.delete(key);
                return next;
              });
            }}
          >
            ▴ hide {run.length} {props.fold}
          </li>,
        );
      }
      run.forEach((entry) => rows.push(renderItem(entry)));
    }
    run = [];
  };
  shown.forEach((item, index) => {
    if (item.isActive) {
      flushRun();
      rows.push(renderItem({item, index}));
    } else {
      run.push({item, index});
    }
  });
  flushRun();

  return (
    <Box maxPossibleHeight={true} className="vertical-slider-root" possibleHeightOffset={3}>
      <ul ref={listRef}>
        {state.length === 0 ? (props.labelIfEmpty || 'No results') : ''}
        {rows}
      </ul>
    </Box>
  );
}
