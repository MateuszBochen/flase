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
  const spacer = (from: number, to: number) => {
    let width = 0;
    for (let index = from; index < to; index++) width += props.widths[index] || 0;
    return width;
  };
  const before = props.visibleColumns ? spacer(0, first) : 0;
  const after = props.visibleColumns ? spacer(last + 1, props.columns.length) : 0;

  return (
    <div
      className={`data-table-row row-${props.rowState} ${props.selected ? 'selected' : ''}`}
      data-row={props.rowIndex}
      onMouseDown={props.hasEdit ? () => handlers.onSelectRow(props.rowIndex) : undefined}
    >
      {before > 0 && <div className="data-table-spacer" style={{width: before, minWidth: before}} />}
      {props.columns.map((column, index) => {
        if (index < first || index > last) {
          return null;
        }
        const value = rowItem[column.key];
        const editable = props.canEdit && !!column.editable && props.rowState !== 'deleted';
        return (
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
          />
        );
      })}
      {after > 0 && <div className="data-table-spacer" style={{width: after, minWidth: after}} />}
    </div>
  );
});
