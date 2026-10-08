import CellPropsInterface from '../Interface/CellPropsInterface';
import {FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import {faArrowUpRightFromSquare} from '@fortawesome/free-solid-svg-icons';
import {binaryLabel, isBinaryValue} from '../../../Library/Record/BinaryValue';
import CellEditor from '../Edit/CellEditor';
import {CellValueType} from '../Interface/RecordsViewPropsInterface';

const renderValue = (value: CellValueType | undefined, placeholder?: string) => {
  if (value === undefined && placeholder) {
    return <span className="dtc-null">{placeholder}</span>;
  }
  if (value === null) {
    return <span className="dtc-null">NULL</span>;
  }
  // empty string must not look like NULL or missing value
  if (value === '') {
    return <span className="dtc-empty" title="empty string">''</span>;
  }
  if (isBinaryValue(value)) {
    return <span className="dtc-binary">{binaryLabel(value)}</span>;
  }
  // other objects must not crash rendering
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

  const stateClass = `${props.changed ? 'changed' : ''} ${props.isEditing ? 'editing' : ''} ${props.selected ? 'cell-selected' : ''}`;

  return (
    <div
      className={`data-table-cell ${className} ${stateClass}`}
      key={keyName}
      style={style}
      onDoubleClick={props.onDoubleClick}
      onContextMenu={props.onContextMenu}
      onMouseDown={props.onMouseDown}
      onMouseEnter={props.onMouseEnter}
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
          <div
            className={`dtc-content ${props.onOpenReference ? 'is-reference' : ''}`}
            title={props.value === null ? 'NULL' : isBinaryValue(props.value) ? 'binary - open value editor' : String(props.value ?? '').slice(0, 500)}
          >
            {props.onOpenReference && (
              <button
                type="button"
                className="dtc-reference"
                title="Open referenced row (Ctrl+click or middle click - new tab)"
                onMouseDown={(event) => {
                  // keep row selection / editing out of it
                  event.stopPropagation();
                  if (event.button === 1) {
                    event.preventDefault();
                    props.onOpenReference!(true);
                  }
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  props.onOpenReference!(event.ctrlKey || event.metaKey);
                }}
                onDoubleClick={(event) => event.stopPropagation()}
              >
                <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
              </button>
            )}
            {renderValue(props.value, props.placeholder)}
          </div>
        )}
      </div>
    </div>
  );
}
