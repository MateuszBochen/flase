import './style.css';
import {useCallback, useEffect, useRef, useState} from 'react';
import TabItem from './TabItem';
import TabLabelListPropsInterface from './Interface/TabLabelListPropsInterface';

/** mouse has to move a bit - otherwise it is only click */
const DRAG_THRESHOLD = 5;

type DragType = {from: number, to: number, offset: number, width: number};

/**
 * TabLabelList - tabs can be dragged to other place (as in browser)
 */
export default  (props: TabLabelListPropsInterface) => {
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<DragType | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const onMoveRef = useRef(props.onLabelMove);
  onMoveRef.current = props.onLabelMove;

  useEffect(() => () => stopRef.current?.(), []);

  const startDrag = useCallback((from: number, startX: number) => {
    const items = Array.from(listRef.current?.children || []) as HTMLElement[];
    if (!onMoveRef.current || items.length < 2 || !items[from]) return;
    const rects = items.map((item) => item.getBoundingClientRect());
    const own = rects[from];
    // tab stays in the list
    const minOffset = rects[0].left - own.left;
    const maxOffset = rects[rects.length - 1].right - own.right;
    const width = own.width + parseFloat(getComputedStyle(items[from]).marginRight || '0');
    let current: DragType | null = null;

    const onMove = (event: MouseEvent) => {
      const offset = event.clientX - startX;
      if (!current && Math.abs(offset) < DRAG_THRESHOLD) return;
      const clamped = Math.min(maxOffset, Math.max(minOffset, offset));
      // new place - front edge of dragged tab passed middle of other tabs
      const middle = (rect: DOMRect) => (rect.left + rect.right) / 2;
      const right = rects.filter((rect, index) => index > from && own.right + clamped > middle(rect)).length;
      const left = rects.filter((rect, index) => index < from && own.left + clamped < middle(rect)).length;
      const to = from + right - left;
      current = {from, to, offset: clamped, width};
      setDrag(current);
    };
    const stop = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('blur', stop);
      stopRef.current = null;
      setDrag(null);
    };
    const onUp = () => {
      const done = current;
      stop();
      if (done && done.to !== done.from) onMoveRef.current?.(done.from, done.to);
    };
    stopRef.current?.();
    stopRef.current = stop;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('blur', stop);
  }, []);

  /** dragged tab follows mouse, tabs between old and new place make room for it */
  const shiftOf = (index: number): number => {
    if (!drag) return 0;
    if (index === drag.from) return drag.offset;
    if (index > drag.from && index <= drag.to) return -drag.width;
    if (index < drag.from && index >= drag.to) return drag.width;
    return 0;
  };

  return (
    <div className="tab-label-list-root">
      <ul className={`tab-label-list ${drag ? 'dragging' : ''}`} ref={listRef}>
        {props.labels.map((label, index) => {
          return (
            <TabItem
              label={label}
              color={props.colors?.[index]}
              isActive={index === props.activeIndex}
              isDragged={drag?.from === index}
              shift={shiftOf(index)}
              onClick={props.onLabelClick}
              onClose={props.onLabelClose}
              onDragStart={startDrag}
              index={index}
              key={index}
            />
          );
        })}
      </ul>
    </div>
  );
}
