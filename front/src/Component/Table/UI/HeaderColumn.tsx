import HeaderColumnPropsInterface from '../Interface/HeaderColumnPropsInterface';
import React, {useCallback, useEffect, useLayoutEffect, useRef} from 'react';
import SortIcons from './SortIcons';


/** HeaderColumn */
export default (props: HeaderColumnPropsInterface) => {

  const thElement = useRef<HTMLDivElement|null>(null);
  const keyName = `${props.column.alias}-${props.column.name}`;
  const columnClassName = `cmp-data-data-header-cell-${keyName}`;

  return (
    <div
      ref={thElement}
      className="header-cell"
      id={columnClassName}
    >
      <div className="column-name-wrapper">
        <div className="column-name">
          {props.column.name}
        </div>
        <SortIcons column={props.column} onSort={props.onSort} />
      </div>
    </div>
  );
}
