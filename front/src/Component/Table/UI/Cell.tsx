import {memo} from 'react';
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

/** Cell - memoized, all props are primitive values or stable objects */
export default memo((props: CellPropsInterface) => {
  const {handlers, rowIndex, columnIndex, column} = props;

  const keyName = `${column.alias}-${column.name}`;
  const className = `cmp-data-data-cell-${keyName}`;

  const style = props.width ? {width: props.width, minWidth: props.width, maxWidth: props.width} : undefined;

  const stateClass = `${props.changed ? 'changed' : ''} ${props.isEditing ? 'editing' : ''} ${props.selected ? 'cell-selected' : ''}`;
  const onOpenReference = props.reference
    ? (newTab: boolean) => handlers.onOpenReference(column, props.value, newTab)
    : undefined;

  return (
    <div
      className={`data-table-cell ${className} ${stateClass}`}
      style={style}
      data-col={columnIndex}
      onDoubleClick={props.editable ? () => handlers.onStartEdit(rowIndex, column) : undefined}
      onContextMenu={props.hasEdit ? (event) => {
        event.preventDefault();
        event.stopPropagation();
        handlers.onContextMenu(event, rowIndex, column);
      } : undefined}
      onMouseDown={props.hasEdit ? (event) => {
        if (event.button === 0 && !props.isEditing) {
          handlers.onCellMouseDown(rowIndex, columnIndex, event.shiftKey ? 'extend' : event.ctrlKey || event.metaKey ? 'add' : 'replace');
        }
      } : undefined}
      onMouseEnter={props.hasEdit ? () => handlers.onCellMouseEnter(rowIndex, columnIndex) : undefined}
    >
      <div className="data-table-cell-content">
        {props.isEditing ? (
          <CellEditor
            mode="inline"
            column={column}
            value={props.value}
            onCommit={(value) => handlers.onCommitEdit(rowIndex, column, value)}
            onCancel={handlers.onCancelEdit}
          />
        ) : (
          <div
            className={`dtc-content ${onOpenReference ? 'is-reference' : ''}`}
            title={props.value === null ? 'NULL' : isBinaryValue(props.value) ? 'binary - open value editor' : String(props.value ?? '').slice(0, 500)}
          >
            {onOpenReference && (
              <button
                type="button"
                className="dtc-reference"
                title="Open referenced row (Ctrl+click or middle click - new tab)"
                onMouseDown={(event) => {
                  // keep row selection / editing out of it
                  event.stopPropagation();
                  if (event.button === 1) {
                    event.preventDefault();
                    onOpenReference!(true);
                  }
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onOpenReference!(event.ctrlKey || event.metaKey);
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
});
