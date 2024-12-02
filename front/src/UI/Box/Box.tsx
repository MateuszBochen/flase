import BoxPropsInterface from './BoxPropsInterface';
import './style.css';
import {useLayoutEffect, useRef} from 'react';

/**
 * Just box
 * @author Mateusz Bochen
 */
export default (props: BoxPropsInterface) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (props.maxPossibleHeight) {
      const document: HTMLDivElement | null = containerRef.current;
      if (document) {
        const offsetTop = document.offsetTop + (props.possibleHeightOffset || 0);
        document.style.height = `calc(100% - ${offsetTop}px`;
      }
    }
  });

  const className = props.className ? props.className : '';
  return (
    <div className={`box-root ${className}`} ref={containerRef} style={props.style}>
      {props.children}
    </div>
  );
}
