import CellPropsInterface from '../Interface/CellPropsInterface';

/** Cell */
export default (props: CellPropsInterface) => {

  const keyName = `${props.column.alias}-${props.column.name}`;
  const className = `cmp-data-data-cell-${keyName}`;


  const columnClassName = `#cmp-data-data-header-cell-${keyName}`;
  const headerElement = props.gridRef.current!.querySelector(columnClassName);


  if (headerElement) {
    const rectBound = headerElement.getBoundingClientRect();
    const rectBoundPx = `${rectBound.width}px`;

    return (
      <div
        className={`data-table-cell ${className}`}
        key={keyName}
        style={{
          width: rectBoundPx,
          minWidth: rectBoundPx,
          maxWidth: rectBoundPx,
        }}
      >
        <div className="data-table-cell-content">
          <div className="dtc-content">
            {props.value}
          </div>
        </div>
      </div>
    );

  } else {
    return (
      <div className={`data-table-cell ${className}`} key={keyName}>
        <div className="data-table-cell-content">
          <div className="dtc-content">
            {props.value}
          </div>
        </div>
      </div>
    );
  }
}
