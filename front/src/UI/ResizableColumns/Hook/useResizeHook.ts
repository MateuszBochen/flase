import React, {useCallback, useLayoutEffect, useRef} from 'react';
import ResizableColumnsSettings from '../App/ResizableColumnsSettings';


export default (columnName: string, columnRef: React.RefObject<HTMLDivElement|null>, rootRef: React.RefObject<HTMLDivElement|null>, rightRef: React.RefObject<HTMLDivElement|null>) => {
  const horizontalResizableColumnSettings:ResizableColumnsSettings = new ResizableColumnsSettings();

  const rootWidth = useRef<number>(0);

  useLayoutEffect(() => {
    if (columnRef.current) {
      const defaultWidth = horizontalResizableColumnSettings.getDefaultWithForName(columnName) || '20%';

      setNewWidth(columnRef.current, defaultWidth)
      const handler:HTMLDivElement|null = columnRef.current.querySelector('.resizable-column-panel-handler');
      if (handler) {
        handler.onmousedown = handleResize;
      }
    }

    if (rootRef.current) {
      rootWidth.current = getWidth(rootRef.current);
      if (rightRef.current && columnRef.current) {
        setNewWidth(rightRef.current, `${rootWidth.current - getWidth(columnRef.current)}px`)
      }

      /** handle window resize */
      new ResizeObserver(() => {
        if (rootRef.current) {
          /** set new with of parent */
          rootWidth.current = getWidth(rootRef.current);

          if (rightRef.current && columnRef.current) {
            setNewWidth(rightRef.current, `${rootWidth.current - getWidth(columnRef.current)}px`)
          }

        }
      }).observe(rootRef.current);

    }
  });

  const handleResize = () => {

    document.body.addEventListener('mousemove', moveMouseHandler);
    document.body.addEventListener('selectstart', disableSelecting);

    document.body.addEventListener(
      'mouseup',
      () => {
        document.body.removeEventListener('mousemove', moveMouseHandler);
        document.body.removeEventListener('selectstart', disableSelecting);
        if (columnRef.current) {
          horizontalResizableColumnSettings.setValue(columnName, columnRef.current.style.width);
        }
      }
    );
  }

  /** handle change of submenu width */
  const moveMouseHandler = useCallback((event: MouseEvent) => {

     event.preventDefault(); // hak for prevent text selection
     event.stopPropagation(); // hak for prevent text selection

     // prevent broken menu
     if (event.pageX < 30) {
       return;
     }

     const width = `${(event.pageX)}px`;

     if (columnRef.current) {
       setNewWidth(columnRef.current, width);
     }

     const newWidth = rootWidth.current - event.pageX;
     if (rightRef.current) {
       setNewWidth(rightRef.current, `${newWidth}px`);
     }

   }, [columnRef.current]);

  const disableSelecting = useCallback((event: any) => {
    event.preventDefault();
  }, []);

  const setNewWidth = useCallback((element: HTMLDivElement, width: string) => {
      element.style.width = width;
      element.style.minWidth = width;
      element.style.maxWidth = width;
  }, []);

  const getWidth = useCallback((element: HTMLDivElement):number => {
      return element.getBoundingClientRect().width;
  }, []);
}
