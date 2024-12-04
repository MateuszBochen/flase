import React, {useRef} from 'react';
import ResizableColumnsPropsInterface from './ResizableColumnsPropsInterface';
import useResizeHook from './Hook/useResizeHook';
import './style.css';


/** ResizableColumns */
export default (props: ResizableColumnsPropsInterface) => {
  const columnRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);

  useResizeHook(props.name, columnRef, rootRef, rightRef);

  return (
    <div className="resizable-columns-root" ref={rootRef}>
      <div
        className="resizable-column" style={{...props.styleLeft}}
        ref={columnRef}
      >
        <div className="resizable-column-resize-panel">
          <div className="resizable-column-panel-handler"/>
        </div>
        {props.leftSide}
      </div>
      <div className="resizable-column-right-side" ref={rightRef}>
        {props.rightSide}
      </div>
    </div>
  );
}

