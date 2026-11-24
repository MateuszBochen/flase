import {isBinaryValue, valueKey} from '../../../Library/Record/BinaryValue';
import {memo, MouseEvent, useMemo} from 'react';
import RowPropsInterface from '../Interface/RowPropsInterface';
import Cell from './Cell';
import {parseSelectedColumns} from '../Interface/GridEditInterface';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';

/** Row - memoized, re-rendered only when its own data, selection or editing changed */
export default memo((props: RowPropsInterface) => {
  const {handlers} = props;
  const rowItem = useMemo(
    () => props.changedValues ? {...props.record, ...props.changedValues} : props.record,
    [props.record, props.changedValues],
  );
  const selectedRanges = useMemo(() => parseSelectedColumns(props.selectedColumns), [props.selectedColumns]);
  const [first, last] = props.visibleColumns || [0, props.columns.length - 1];
  const before = props.spacerBefore;
  const after = props.spacerAfter;
  const isEditable = (column: ColumnInterface) => props.canEdit && !!column.editable && props.rowState !== 'deleted';
  const isEditing = (column: ColumnInterface) => isEditable(column) && props.editingColumnKey === column.key;

  /** events of cells are handled here (delegation) - index of column is data-col of cell */
  const cellIndexOf = (target: EventTarget | null, row: HTMLElement): number | null => {
    const cell = target instanceof Element ? target.closest('.data-table-cell') as HTMLElement | null : null;
    return cell && row.contains(cell) && cell.dataset.col !== undefined ? Number(cell.dataset.col) : null;
  };
  const onMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    const index = cellIndexOf(event.target, event.currentTarget);
    const column = index === null ? undefined : props.columns[index];
    if (index !== null && column && event.button === 0 && !isEditing(column)) {
      handlers.onCellMouseDown(props.rowIndex, index, event.shiftKey ? 'extend' : event.ctrlKey || event.metaKey ? 'add' : 'replace');
    }
    handlers.onSelectRow(props.rowIndex);
  };
  const onDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    const index = cellIndexOf(event.target, event.currentTarget);
    const column = index === null ? undefined : props.columns[index];
    if (column && isEditable(column)) {
      handlers.onStartEdit(props.rowIndex, column);
    }
  };
  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const index = cellIndexOf(event.target, event.currentTarget);
    const column = index === null ? undefined : props.columns[index];
    if (column) {
      event.preventDefault();
      event.stopPropagation();
      handlers.onContextMenu(event, props.rowIndex, column);
    }
  };
  /** mouseenter of cell - mouseover of row from other cell (or from outside of row) */
  const onMouseOver = (event: MouseEvent<HTMLDivElement>) => {
    const index = cellIndexOf(event.target, event.currentTarget);
    if (index !== null && index !== cellIndexOf(event.relatedTarget, event.currentTarget)) {
      handlers.onCellMouseEnter(props.rowIndex, index);
    }
  };

  // only visible columns are walked - wide tables (hundreds of columns) do not loop over hidden ones in every row
  const cells = [];
  for (let index = first; index <= last && index < props.columns.length; index++) {
    const column = props.columns[index];
    const value = rowItem[column.key];
    const editable = isEditable(column);
    cells.push(
      <Cell
        key={`${column.alias}-${column.name}-${index}`}
        tabIndex={props.tabIndex}
        cellRender={props.cellRender}
        column={column}
        columnIndex={index}
        rowIndex={props.rowIndex}
        width={props.widths[index]}
        value={value}
        placeholder={props.rowState === 'inserted' ? 'DEFAULT' : undefined}
        changed={props.rowState === 'inserted' || (!!props.changedValues && column.key in props.changedValues)}
        isEditing={editable && props.editingColumnKey === column.key}
        selected={selectedRanges.some(([from, to]) => index >= from && index <= to)}
        reference={props.hasReference && !!column.reference && props.rowState !== 'inserted' && value !== null && value !== undefined}
        handlers={handlers}
        transform={props.display?.transforms[column.key] || ''}
        label={value !== null && value !== undefined && (typeof value !== 'object' || isBinaryValue(value)) ? props.display?.labels[column.key]?.[valueKey(value)] : undefined}
      />,
    );
  }

  return (
    <div
      className={`data-table-row row-${props.rowState} ${props.selected ? 'selected' : ''}`}
      data-row={props.rowIndex}
      onMouseDown={props.hasEdit ? onMouseDown : undefined}
      onDoubleClick={props.canEdit ? onDoubleClick : undefined}
      onContextMenu={props.hasEdit ? onContextMenu : undefined}
      onMouseOver={props.hasEdit ? onMouseOver : undefined}
    >
      {before > 0 && <div className="data-table-spacer" style={{width: before, minWidth: before}} />}
      {cells}
      {after > 0 && <div className="data-table-spacer" style={{width: after, minWidth: after}} />}
    </div>
  );
});
