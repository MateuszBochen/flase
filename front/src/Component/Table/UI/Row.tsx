import {isBinaryValue, valueKey} from '../../../Library/Record/BinaryValue';
import {memo, useMemo} from 'react';
import RowPropsInterface from '../Interface/RowPropsInterface';
import Cell from './Cell';
import {parseSelectedColumns} from '../Interface/GridEditInterface';

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
  // only visible columns are walked - wide tables (hundreds of columns) do not loop over hidden ones in every row
  const cells = [];
  for (let index = first; index <= last && index < props.columns.length; index++) {
    const column = props.columns[index];
    const value = rowItem[column.key];
    const editable = props.canEdit && !!column.editable && props.rowState !== 'deleted';
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
        hasEdit={props.hasEdit}
        editable={editable}
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
      onMouseDown={props.hasEdit ? () => handlers.onSelectRow(props.rowIndex) : undefined}
    >
      {before > 0 && <div className="data-table-spacer" style={{width: before, minWidth: before}} />}
      {cells}
      {after > 0 && <div className="data-table-spacer" style={{width: after, minWidth: after}} />}
    </div>
  );
});
