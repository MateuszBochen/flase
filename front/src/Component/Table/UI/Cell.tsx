import CellPropsInterface from '../Interface/CellPropsInterface';
import CellEditor from '../Edit/CellEditor';
import {CellValueType} from '../Interface/RecordsViewPropsInterface';

const renderValue = (value: CellValueType | undefined, placeholder?: string) => {
  if (value === undefined && placeholder) {
    return <span className="dtc-null">{placeholder}</span>;
  }
  if (value === null) {
    return <span className="dtc-null">NULL</span>;
  }
  // e.g. binary values - must not crash rendering
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
};

/** Cell */
export default (props: CellPropsInterface) => {

  const keyName = `${props.column.alias}-${props.column.name}`;
  const className = `cmp-data-data-cell-${keyName}`;

  const columnClassName = `#cmp-data-data-header-cell-${keyName}`;
  const headerElement = props.gridRef.current!.querySelector(columnClassName);

  let style;
  if (headerElement) {
    const rectBoundPx = `${headerElement.getBoundingClientRect().width}px`;
    style = {
      width: rectBoundPx,
      minWidth: rectBoundPx,
      maxWidth: rectBoundPx,
    };
  }

  const stateClass = `${props.changed ? 'changed' : ''} ${props.isEditing ? 'editing' : ''}`;

  return (
    <div
      className={`data-table-cell ${className} ${stateClass}`}
      key={keyName}
      style={style}
      onDoubleClick={props.onDoubleClick}
      onContextMenu={props.onContextMenu}
    >
      <div className="data-table-cell-content">
        {props.isEditing ? (
          <CellEditor
            mode="inline"
            column={props.column}
            value={props.value}
            onCommit={props.onCommit}
            onCancel={props.onCancel}
          />
        ) : (
          <div className="dtc-content" title={props.value === null ? 'NULL' : String(props.value ?? '')}>
            {renderValue(props.value, props.placeholder)}
          </div>
        )}
      </div>
    </div>
  );
}
