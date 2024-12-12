import HeaderColumnPropsInterface from '../Interface/HeaderColumnPropsInterface';
import React, {useCallback, useEffect, useLayoutEffect, useRef} from 'react';
import SortIcons from './SortIcons';


/** HeaderColumn */
export default (props: HeaderColumnPropsInterface) => {

  const thElement = useRef<HTMLTableHeaderCellElement|null>(null);
  const keyName = `${props.column.alias}-${props.column.name}`;
  const className = `.cmp-data-data-cell-${keyName}`;
  const columnClassName = `cmp-data-data-header-cell-${keyName}`;

  console.log('hc', className);

 /* useLayoutEffect(() => {

      const elements = document.querySelectorAll<HTMLDivElement>(className);
      elements.forEach(element => {
        if (thElement.current) {
          element.style.width = `${thElement.current.getBoundingClientRect().width}px`;
        }
      });

  });*/

  const resize = useCallback((target: DOMRectReadOnly) => {
    const elements = document.querySelectorAll<HTMLDivElement>(className);
    elements.forEach(element => {
      if (target) {
        element.style.width = `${target.width + 11}px`;
      }
    });
  }, [])

  useEffect(() => {
    if (thElement.current) {
      new ResizeObserver((entries: ResizeObserverEntry[]) => {
        entries.forEach((entry) => {
          resize(entry.contentRect)
        });

      }).observe(thElement.current);

    }
  }, []);


  return (
    <th
      ref={thElement}
      className={columnClassName}
    >
      <div className="column-name-wrapper">
        <div className="column-name">
          {props.column.name}
        </div>
        <SortIcons column={props.column} onSort={props.onSort} />
      </div>
    </th>
  );
}
