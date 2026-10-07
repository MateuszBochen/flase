import RecordsViewPropsInterface, {CellValueType, SingleRowType} from './Interface/RecordsViewPropsInterface';
import './style.css';
import TableFooter from './UI/TableFooter';
import HeaderColumns from './UI/HeaderColumns';
import React, {forwardRef, MouseEvent, useCallback, useImperativeHandle, useMemo, useRef, useState} from 'react';
import RecordsViewRefInterface from './Interface/RecordsViewRefInterface';
import HeaderColumnsRefInterface from './Interface/HeaderColumnsRefInterface';
import ColumnInterface from '../../Library/Table/Interface/ColumnInterface';
import DataGrid from './UI/DataGrid';
import DataGridRefInterface from './Interface/DataGridRefInterface';
import TableFooterRefInterface from '../Application/TableRecords/Interface/TableFooterRefInterface';
import EditableResultInterface from '../../Library/Record/Interface/EditableResultInterface';
import GridEditInterface, {EditingCellType} from './Interface/GridEditInterface';
import {
  buildRowChanges,
  countChanges,
  emptyChanges,
  getDisplayedRow,
  getRowState,
  insertRow,
  PendingChanges,
  setRowValues,
  toggleDeleteRow,
  valuesForNewRow,
} from './Edit/PendingChanges';
import PendingChangesBar from './UI/PendingChangesBar';
import ContextMenu, {ContextMenuItem} from '../../UI/ContextMenu/ContextMenu';
import RowForm from './Edit/RowForm';
import toast from 'react-hot-toast';

type QueryStatus = {
  loading: boolean;
  rows: number;
  error: string|null;
};

type RowFormState = {
  title: string;
  values: SingleRowType;
  /** undefined for new row */
  rowIndex?: number;
} | null;

type ContextMenuState = {
  x: number;
  y: number;
  /** null when clicked outside of rows */
  rowIndex: number | null;
  column: ColumnInterface | null;
} | null;

/** RecordsView */
export default forwardRef<RecordsViewRefInterface|null, RecordsViewPropsInterface>((props, ref) => {

  const [status, setStatus] = useState<QueryStatus>({loading: true, rows: 0, error: null});

  /** editing */
  const [columns, setColumns] = useState<ColumnInterface[]>([]);
  const [editable, setEditable] = useState<EditableResultInterface | null>(null);
  const [readOnlyReason, setReadOnlyReason] = useState<string | undefined>(undefined);
  const [changes, setChanges] = useState<PendingChanges>(emptyChanges());
  const [selectedRow, setSelectedRow] = useState<number | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCellType | null>(null);
  const [rowForm, setRowForm] = useState<RowFormState>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);

  const totalRows = useRef<number>(0);
  const dataGridRef = useRef<HTMLDivElement|null>(null);
  const columnsViewRef = useRef<HeaderColumnsRefInterface|null>(null);
  const dataGridViewRef = useRef<DataGridRefInterface|null>(null);
  const footerRef = useRef<TableFooterRefInterface|null>(null);

  const pendingCount = countChanges(changes);
  // read in reset, which can run before re-render after clearEditing
  const pendingCountRef = useRef<number>(0);
  pendingCountRef.current = pendingCount;
  const canEdit = !!editable && !!props.onSubmitChanges;

  const getRecords = (): SingleRowType[] => dataGridViewRef.current?.getRecords() || [];

  const clearEditing = () => {
    pendingCountRef.current = 0;
    setChanges(emptyChanges());
    setSelectedRow(null);
    setEditingCell(null);
    setRowForm(null);
    setContextMenu(null);
  };

  useImperativeHandle(ref, () => ({
    addRow: (rowItem: SingleRowType) => {
      dataGridViewRef.current!.addRow(rowItem);
      totalRows.current = totalRows.current += 1;
      footerRef.current!.setLength(totalRows.current);
    },
    setColumns: (newColumns: ColumnInterface[], newEditable?: EditableResultInterface | null, newReadOnlyReason?: string) => {
      columnsViewRef.current!.setColumns(newColumns);
      dataGridViewRef.current!.setColumns(newColumns);
      setColumns(newColumns);
      setEditable(newEditable || null);
      setReadOnlyReason(newReadOnlyReason);
    },
    reset: (option?: string, keepScroll?: boolean) => {
      if (option !== 'records') {
        columnsViewRef.current!.reset();
      }
      dataGridViewRef.current!.reset(keepScroll);
      footerRef.current!.setLength(0);
      footerRef.current!.setTotal(0);
      footerRef.current!.setLimit(0, 100);
      // footerRef.current!.setPerPage(100);
      totalRows.current = 0;
      setStatus({loading: true, rows: 0, error: null});

      if (pendingCountRef.current) {
        toast(`${pendingCountRef.current} pending change(s) were discarded`);
      }
      clearEditing();
    },
    setFinished: (rows: number) => setStatus({loading: false, rows, error: null}),
    setError: (error: string) => setStatus({loading: false, rows: 0, error}),
    setLimit: footerRef.current?.setLimit,
    setTotal: footerRef.current?.setTotal,
    clearChanges: clearEditing,
    commitChanges: () => {
      if (changes.inserted.length) {
        clearEditing();
        return true;
      }

      const deleted = Object.keys(changes.deleted).map(Number);
      dataGridViewRef.current!.applyChanges(changes.updated, deleted);
      if (deleted.length) {
        totalRows.current -= deleted.length;
        footerRef.current!.setLength(totalRows.current);
        footerRef.current!.adjustTotal(-deleted.length);
      }
      clearEditing();
      return false;
    },

  } as RecordsViewRefInterface));

  /** grid callbacks */
  const onCommitEdit = useCallback((rowIndex: number, column: ColumnInterface, value: CellValueType) => {
    setChanges((previous) => setRowValues(previous, getRecords(), rowIndex, {[column.key]: value}));
    setEditingCell(null);
  }, []);

  const onContextMenu = useCallback((event: MouseEvent, rowIndex: number | null, column: ColumnInterface | null) => {
    if (rowIndex !== null) {
      setSelectedRow(rowIndex);
    }
    setEditingCell(null);
    setContextMenu({x: event.clientX, y: event.clientY, rowIndex, column});
  }, []);

  const edit: GridEditInterface = useMemo(() => ({
    changes,
    selectedRow,
    editingCell,
    canEdit,
    onSelectRow: setSelectedRow,
    onStartEdit: (rowIndex: number, column: ColumnInterface) => {
      setSelectedRow(rowIndex);
      setEditingCell({rowIndex, columnKey: column.key});
    },
    onCommitEdit,
    onCancelEdit: () => setEditingCell(null),
    onContextMenu,
  }), [changes, selectedRow, editingCell, canEdit, onCommitEdit, onContextMenu]);

  /** row actions */
  const onAddRow = () => setRowForm({title: 'New row', values: valuesForNewRow(columns)});

  const onCloneRow = (rowIndex: number) => {
    const source = getDisplayedRow(changes, getRecords(), rowIndex);
    setRowForm({title: 'Clone row', values: valuesForNewRow(columns, source)});
  };

  const onEditRow = (rowIndex: number) => {
    setRowForm({title: 'Edit row', values: getDisplayedRow(changes, getRecords(), rowIndex), rowIndex});
  };

  const onDeleteRow = (rowIndex: number) => {
    const records = getRecords();
    // removing inserted row shifts other inserted rows
    if (rowIndex >= records.length) {
      setSelectedRow(null);
    }
    setChanges((previous) => toggleDeleteRow(previous, records, rowIndex));
  };

  const onSaveRowForm = (values: SingleRowType) => {
    if (!rowForm) return;
    if (rowForm.rowIndex === undefined) {
      setChanges((previous) => insertRow(previous, values));
    } else {
      setChanges((previous) => setRowValues(previous, getRecords(), rowForm.rowIndex!, values));
    }
    setRowForm(null);
  };

  const currentRowChanges = () => buildRowChanges(changes, getRecords(), columns, editable!);
  const onPreview = () => props.onPreviewChanges?.(editable!, currentRowChanges());
  const onSubmit = () => props.onSubmitChanges?.(editable!, currentRowChanges());

  const copyToClipboard = (value: CellValueType | undefined) => {
    const text = value === null || value === undefined ? 'NULL' : String(value);
    navigator.clipboard?.writeText(text)
      .then(() => toast.success('Copied'))
      .catch(() => toast.error('Unable to copy'));
  };

  const contextMenuItems = (menu: NonNullable<ContextMenuState>): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    const records = getRecords();
    const {rowIndex, column} = menu;
    const rowState = rowIndex !== null ? getRowState(changes, records, rowIndex) : null;

    if (rowIndex !== null && column) {
      const value = getDisplayedRow(changes, records, rowIndex)[column.key];
      items.push({label: 'Copy value', onClick: () => copyToClipboard(value)});
    }

    if (!canEdit) {
      if (readOnlyReason) {
        items.push({label: `Read only: ${readOnlyReason}`, disabled: true});
      }
      return items;
    }

    if (rowIndex !== null && rowState !== 'deleted') {
      const cellEditable = !!column?.editable;
      items.push(
        {label: 'Edit cell', hint: 'double click', disabled: !cellEditable, onClick: () => edit.onStartEdit(rowIndex, column!)},
        {label: 'Set NULL', disabled: !cellEditable || !column?.nullable, onClick: () => onCommitEdit(rowIndex, column!, null)},
        'separator',
        {label: 'Edit row…', onClick: () => onEditRow(rowIndex)},
        {label: 'Clone row…', onClick: () => onCloneRow(rowIndex)},
      );
    }

    if (rowIndex !== null) {
      items.push({
        label: rowState === 'deleted' ? 'Undo delete' : rowState === 'inserted' ? 'Remove new row' : 'Delete row',
        danger: rowState !== 'deleted',
        onClick: () => onDeleteRow(rowIndex),
      });
    }

    if (items.length) {
      items.push('separator');
    }
    items.push({label: 'Add row…', onClick: onAddRow});

    if (pendingCount) {
      items.push(
        'separator',
        {label: 'Preview SQL', hint: `${pendingCount}`, disabled: props.submitting, onClick: onPreview},
        {label: 'Submit changes', hint: `${pendingCount}`, disabled: props.submitting, onClick: onSubmit},
        {label: 'Revert all changes', danger: true, disabled: props.submitting, onClick: clearEditing},
      );
    }

    return items;
  };

  return (
    <div
      className="cmp-records-view"
    >
      <div
        className="cmp-records-view-table-wrapper"
      >
       <div
         ref={dataGridRef}
         className="cmp-data-grid"
       >
         <HeaderColumns
           ref={columnsViewRef}
           onColumnDidMount={() => {}}
           onSort={props.onSort}
           parentRef={dataGridRef}
         />
         <DataGrid
           ref={dataGridViewRef}
           cellRender={props.cellRender}
           tabIndex={0}
           parentRef={dataGridRef}
           edit={edit}
         />
       </div>
       {status.error && (
         <div className="cmp-records-view-message cmp-records-view-message-error">{status.error}</div>
       )}
       {!status.loading && !status.error && status.rows === 0 && changes.inserted.length === 0 && (
         <div className="cmp-records-view-message">No rows</div>
       )}
      </div>
      <div className="cmp-records-view-pager">
        <TableFooter
          onPageChange={props.onPageChange}
          loading={status.loading}
          ref={footerRef}
        >
          <PendingChangesBar
            canEdit={canEdit}
            readOnlyReason={readOnlyReason}
            pendingCount={pendingCount}
            submitting={!!props.submitting}
            onRevert={clearEditing}
            onPreview={onPreview}
            onSubmit={onSubmit}
          />
        </TableFooter>
      </div>
      {rowForm && (
        <RowForm
          title={rowForm.title}
          columns={columns}
          values={rowForm.values}
          isNewRow={rowForm.rowIndex === undefined}
          onSave={onSaveRowForm}
          onCancel={() => setRowForm(null)}
        />
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenuItems(contextMenu)}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
});
