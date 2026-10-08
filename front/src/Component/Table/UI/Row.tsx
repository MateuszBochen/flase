import RowPropsInterface from '../Interface/RowPropsInterface';
import Cell from './Cell';
import {isInSelection} from '../Interface/GridEditInterface';

/** Row */
export default (props: RowPropsInterface) => {
  const edit = props.edit;
  const selected = edit?.selectedRow === props.rowIndex ? 'selected' : '';

  return (
    <div
      className={`data-table-row row-${props.rowState} ${selected}`}
      onMouseDown={() => edit?.onSelectRow(props.rowIndex)}
    >
      {props.columns.map((column, index) => {

        const keyName = `${column.alias}-${column.name}-${index}`;
        const canEditCell = !!edit?.canEdit && !!column.editable && props.rowState !== 'deleted';
        const isEditing = canEditCell
          && edit?.editingCell?.rowIndex === props.rowIndex
          && edit?.editingCell?.columnKey === column.key;

        return (
          <Cell
            tabIndex={props.tabIndex}
            cellRender={props.cellRender}
            key={keyName}
            column={column}
            value={props.rowItem[column.key]}
            gridRef={props.gridRef}
            placeholder={props.rowState === 'inserted' ? 'DEFAULT' : undefined}
            changed={props.rowState === 'inserted' || (!!props.changedValues && column.key in props.changedValues)}
            isEditing={isEditing}
            onDoubleClick={canEditCell ? () => edit!.onStartEdit(props.rowIndex, column) : undefined}
            selected={isInSelection(edit?.selection || null, props.rowIndex, index)}
            onMouseDown={edit ? (event) => {
              if (event.button === 0 && !isEditing) {
                edit.onCellMouseDown(props.rowIndex, index, event.shiftKey ? 'extend' : event.ctrlKey || event.metaKey ? 'add' : 'replace');
              }
            } : undefined}
            onMouseEnter={edit ? () => edit.onCellMouseEnter(props.rowIndex, index) : undefined}
            onContextMenu={edit ? (event) => {
              event.preventDefault();
              event.stopPropagation();
              edit.onContextMenu(event, props.rowIndex, column);
            } : undefined}
            onCommit={(value) => edit!.onCommitEdit(props.rowIndex, column, value)}
            onCancel={() => edit!.onCancelEdit()}
            onOpenReference={props.onOpenReference && column.reference && props.rowState !== 'inserted'
              && props.rowItem[column.key] !== null && props.rowItem[column.key] !== undefined
              ? (newTab) => props.onOpenReference!(column, props.rowItem[column.key], newTab)
              : undefined}
          />
        );
      })}
    </div>
  );
}
