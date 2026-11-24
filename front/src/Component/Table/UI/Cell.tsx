import {memo} from 'react';
import CellPropsInterface from '../Interface/CellPropsInterface';
import {binaryLabel, isBinaryValue, isLongText} from '../../../Library/Record/BinaryValue';
import CellEditor from '../Edit/CellEditor';
import {CellValueType} from '../Interface/RecordsViewPropsInterface';
import {renderTransformed} from '../Display/GridDisplay';

/** narrow cell shows only beginning - layout of megabytes of text in one line freezes the browser */
const DISPLAY_CHARS = 1000;

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
  if (isLongText(value)) {
    return value.text.slice(0, DISPLAY_CHARS);
  }
  if (typeof value === 'string' && value.length > DISPLAY_CHARS) {
    return value.slice(0, DISPLAY_CHARS);
  }
  // other objects must not crash rendering
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
};

/**
 * Cell - memoized, all props are primitive values or stable objects.
 * Mouse events of cells (selection, editing, context menu) are handled by row - one listener instead of four in every cell.
 * Cell is one element with value directly inside - it is rendered for every visible column of every visible row
 * (measured on table of 50 columns: 2,400 instead of 5,200 elements on page, ~15% less CPU of opening).
 */
export default memo((props: CellPropsInterface) => {
  const {handlers, rowIndex, columnIndex, column} = props;

  const style = props.width ? {width: props.width, minWidth: props.width, maxWidth: props.width} : undefined;

  const stateClass = `${props.changed ? ' changed' : ''}${props.isEditing ? ' editing' : ''}${props.selected ? ' cell-selected' : ''}`;
  const onOpenReference = props.reference
    ? (newTab: boolean) => handlers.onOpenReference(column, props.value, newTab)
    : undefined;

  if (props.isEditing) {
    return (
      <div className={`data-table-cell cmp-data-data-cell-${column.alias}-${column.name}${stateClass}`} style={style} data-col={columnIndex}>
        <CellEditor
          mode="inline"
          column={column}
          value={props.value}
          onCommit={(value) => handlers.onCommitEdit(rowIndex, column, value)}
          onCancel={handlers.onCancelEdit}
        />
      </div>
    );
  }

  return (
    <div
      className={`data-table-cell cmp-data-data-cell-${column.alias}-${column.name}${stateClass}${onOpenReference ? ' is-reference' : ''}`}
      style={style}
      data-col={columnIndex}
      title={props.value === null ? 'NULL' : isBinaryValue(props.value) ? 'binary - open value editor'
        : isLongText(props.value) ? `${props.value.text.slice(0, 500)}… (${props.value.length.toLocaleString()} characters - open value editor)`
        : String(props.value ?? '').slice(0, 500)}
    >
      {onOpenReference && (
        // icon is a CSS mask of the button (.dtc-reference::before) - svg in every cell of foreign key was 2 elements more
        <button
          type="button"
          className="dtc-reference"
          title="Open referenced row (Ctrl+click or middle click - new tab)"
          aria-label="Open referenced row"
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
        />
      )}
      {(props.transform && !isLongText(props.value) && renderTransformed(props.value, props.transform, column, rowIndex)) || renderValue(props.value, props.placeholder)}
      {props.label !== undefined && <span className="dtc-label" title={props.label}>{props.label}</span>}
    </div>
  );
});
