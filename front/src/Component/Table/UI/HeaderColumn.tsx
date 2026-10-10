import HeaderColumnPropsInterface from '../Interface/HeaderColumnPropsInterface';
import React from 'react';
import SortIcons from './SortIcons';


/** HeaderColumn */
export default (props: HeaderColumnPropsInterface) => {

  const keyName = `${props.column.alias}-${props.column.name}`;
  const columnClassName = `cmp-data-data-header-cell-${keyName}`;
  const style = props.width ? {width: props.width, minWidth: props.width, maxWidth: props.width} : undefined;

  return (
    <div
      className={`header-cell ${props.width ? 'sized' : ''}`}
      id={columnClassName}
      style={style}
    >
      <div className="column-name-wrapper">
        <div className="column-name" title={props.column.name}>
          {props.column.name}
        </div>
        <SortIcons column={props.column} onSort={props.onSort} />
      </div>
      <div
        className="column-resize-handle"
        title="Drag to resize, double click - fit to content"
        onMouseDown={props.onResizeStart}
        onDoubleClick={(event) => {
          event.stopPropagation();
          props.onResizeFit();
        }}
      />
    </div>
  );
}
