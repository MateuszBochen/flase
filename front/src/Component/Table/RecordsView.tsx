import RecordsViewPropsInterface, {CellValueType, QuickFilterOperatorType, SingleRowType} from './Interface/RecordsViewPropsInterface';
import './style.css';
import TableFooter from './UI/TableFooter';
import HeaderColumns from './UI/HeaderColumns';
import React, {forwardRef, KeyboardEvent, MouseEvent, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState} from 'react';
import RecordsViewRefInterface from './Interface/RecordsViewRefInterface';
import HeaderColumnsRefInterface from './Interface/HeaderColumnsRefInterface';
import ColumnInterface from '../../Library/Table/Interface/ColumnInterface';
import DataGrid from './UI/DataGrid';
import DataGridRefInterface from './Interface/DataGridRefInterface';
import TableFooterRefInterface from '../Application/TableRecords/Interface/TableFooterRefInterface';
import EditableResultInterface from '../../Library/Record/Interface/EditableResultInterface';
import GridEditInterface, {
  CellPositionType,
  EditingCellType,
  isInSelection,
  SelectionType,
  SelectModeType,
  selectedRowsAndColumns,
} from './Interface/GridEditInterface';
import {COPY_FORMATS, CopyFormatType, EXPORT_FILE, formatCopy} from './Copy/CopyFormats';
import downloadText from '../../Library/File/downloadText';
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
import ValueEditor from './Edit/ValueEditor';
import {isBinaryValue} from '../../Library/Record/BinaryValue';
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
  const [valueEditor, setValueEditor] = useState<{rowIndex: number, column: ColumnInterface} | null>(null);
  const [exportMenu, setExportMenu] = useState<{x: number, y: number} | null>(null);
  const [selection, setSelection] = useState<SelectionType | null>(null);
  /** mouse button is held on cell - moving over cells extends selection */
  const selecting = useRef<boolean>(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

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
    setSelection(null);
  };

  useEffect(() => {
    const stopSelecting = () => selecting.current = false;
    document.addEventListener('mouseup', stopSelecting);
    return () => document.removeEventListener('mouseup', stopSelecting);
  }, []);

  /** click outside of rows (empty part of grid, other parts of page) clears selection */
  useEffect(() => {
    const onMouseDown = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest) return;
      // rows of this grid select themselves, menus and dialogs work with current selection
      const onOwnRow = !!target.closest('.data-table-row') && !!rootRef.current?.contains(target);
      if (onOwnRow || target.closest('.ui-context-menu, .popup-root, [role="status"]')) {
        return;
      }
      setSelection(null);
      setSelectedRow(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

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

  const onCellMouseDown = useCallback((rowIndex: number, columnIndex: number, mode: SelectModeType) => {
    selecting.current = true;
    // keyboard shortcuts (Ctrl+C, Ctrl+A) go to the grid
    rootRef.current?.focus({preventScroll: true});
    const cell: CellPositionType = {rowIndex, columnIndex};
    setSelection((previous) => {
      if (mode === 'extend' && previous?.length) {
        return [...previous.slice(0, -1), {anchor: previous[previous.length - 1].anchor, focus: cell}];
      }
      if (mode === 'add' && previous?.length) {
        // ctrl+click on selected single cell unselects it
        const single = previous.findIndex(({anchor, focus}) => anchor.rowIndex === rowIndex && anchor.columnIndex === columnIndex
          && focus.rowIndex === rowIndex && focus.columnIndex === columnIndex);
        if (single >= 0) {
          selecting.current = false;
          const rest = previous.filter((range, index) => index !== single);
          return rest.length ? rest : null;
        }
        return [...previous, {anchor: cell, focus: cell}];
      }
      return [{anchor: cell, focus: cell}];
    });
  }, []);

  /** dragging changes the last range */
  const onCellMouseEnter = useCallback((rowIndex: number, columnIndex: number) => {
    if (selecting.current) {
      setSelection((previous) => previous?.length
        ? [...previous.slice(0, -1), {anchor: previous[previous.length - 1].anchor, focus: {rowIndex, columnIndex}}]
        : previous);
    }
  }, []);

  const onContextMenu = useCallback((event: MouseEvent, rowIndex: number | null, column: ColumnInterface | null) => {
    if (rowIndex !== null) {
      setSelectedRow(rowIndex);
      // right click outside of selection selects the clicked cell
      const columnIndex = column ? columnsRef.current.findIndex((item) => item.key === column.key) : -1;
      setSelection((previous) => columnIndex >= 0 && !isInSelection(previous, rowIndex, columnIndex)
        ? [{anchor: {rowIndex, columnIndex}, focus: {rowIndex, columnIndex}}]
        : previous);
    }
    setEditingCell(null);
    setContextMenu({x: event.clientX, y: event.clientY, rowIndex, column});
  }, []);

  const columnsRef = useRef<ColumnInterface[]>([]);
  columnsRef.current = columns;

  const edit: GridEditInterface = useMemo(() => ({
    changes,
    selectedRow,
    editingCell,
    canEdit,
    selection,
    onCellMouseDown,
    onCellMouseEnter,
    onSelectRow: setSelectedRow,
    onStartEdit: (rowIndex: number, column: ColumnInterface) => {
      setSelectedRow(rowIndex);
      setEditingCell({rowIndex, columnKey: column.key});
    },
    onCommitEdit,
    onCancelEdit: () => setEditingCell(null),
    onContextMenu,
  }), [changes, selectedRow, editingCell, canEdit, selection, onCellMouseDown, onCellMouseEnter, onCommitEdit, onContextMenu]);

  /** rows and columns as text in given format */
  const formatRows = (format: CopyFormatType, rowIndexes: number[], columnIndexes: number[]): string => {
    const records = getRecords();
    return formatCopy(
      format,
      columnIndexes.map((index) => columns[index]),
      rowIndexes.map((rowIndex) => getDisplayedRow(changes, records, rowIndex)),
      editable?.table.name,
      props.sqlLiteral,
    );
  };

  /**
   * selected cells as text in given format.
   * Ctrl selection does not have to be rectangle - rows and columns with any selected cell are copied.
   */
  const copySelection = (format: CopyFormatType) => {
    if (!selection) return;
    const rowsCount = getRecords().length + changes.inserted.length;
    const {rows, columns: columnIndexes} = selectedRowsAndColumns(selection, rowsCount);
    const text = formatRows(format, rows, columnIndexes);
    const cells = rows.length * columnIndexes.length;
    navigator.clipboard?.writeText(text)
      .then(() => toast.success(cells === 1 ? 'Copied' : `Copied ${rows.length} × ${columnIndexes.length} cells`))
      .catch(() => toast.error('Unable to copy'));
  };

  /** rows loaded in grid (current page, with pending changes) as file */
  const exportPage = (format: CopyFormatType) => {
    const rowsCount = getRecords().length + changes.inserted.length;
    const rowIndexes = Array.from({length: rowsCount}, (value, index) => index);
    const text = formatRows(format, rowIndexes, columns.map((column, index) => index));
    const file = EXPORT_FILE[format];
    downloadText(`${props.exportName || 'export'}.${file.extension}`, text, file.mimeType);
    toast.success(`Exported ${rowsCount} row(s)`);
  };

  const exportMenuItems = (): ContextMenuItem[] => {
    const formats = (onClick: (format: CopyFormatType) => void): ContextMenuItem[] => COPY_FORMATS
      .filter(({format}) => format !== 'tsv')
      .map(({format, label}) => ({label: label === 'TSV with header' ? 'TSV' : label, onClick: () => onClick(format)}));
    const items: ContextMenuItem[] = [
      {label: 'Current page as', disabled: !columns.length, children: formats(exportPage)},
    ];
    if (props.onExportAll) {
      items.push({
        label: 'All rows as',
        disabled: !columns.length,
        children: formats((format) => props.onExportAll!(format, props.exportName || 'export')),
      });
    }
    return items;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && event.key.toLowerCase() === 'c' && selection) {
      event.preventDefault();
      copySelection('tsv');
    } else if (ctrl && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      const rowsCount = getRecords().length + changes.inserted.length;
      if (rowsCount && columns.length) {
        setSelection([{anchor: {rowIndex: 0, columnIndex: 0}, focus: {rowIndex: rowsCount - 1, columnIndex: columns.length - 1}}]);
      }
    } else if (event.key === 'Escape') {
      setSelection(null);
      setSelectedRow(null);
    }
  };

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
      items.push({label: 'Open value editor…', onClick: () => setValueEditor({rowIndex, column})});
      items.push({label: 'Copy value', onClick: () => copyToClipboard(isBinaryValue(value) ? (value.text ?? `0x${value.hex}`) as any : value)});
      items.push({
        label: 'Copy selection as',
        children: COPY_FORMATS.map(({format, label}) => ({label, hint: format === 'tsv' ? 'Ctrl+C' : undefined, onClick: () => copySelection(format)})),
      });
      if (column.reference && props.onOpenReference && value !== null && value !== undefined && !isBinaryValue(value) && rowState !== 'inserted') {
        items.push(
          {label: `Open ${column.reference.table.name} row`, onClick: () => props.onOpenReference!(column, value, false)},
          {label: `Open ${column.reference.table.name} row in new tab`, onClick: () => props.onOpenReference!(column, value, true)},
        );
      }
    }

    // expressions (no table column) cannot be used in WHERE by their alias
    const filterValue = rowIndex !== null && column ? getDisplayedRow(changes, records, rowIndex)[column.key] : undefined;
    if (rowIndex !== null && column && column.orgName && props.onQuickFilter && !isBinaryValue(filterValue)) {
      const value = filterValue;
      const shown = value === null || value === undefined ? 'NULL' : String(value).length > 30 ? `${String(value).slice(0, 30)}…` : String(value);
      const filter = (operator: QuickFilterOperatorType) => () => props.onQuickFilter!(column, value ?? null, operator);
      items.push('separator');
      if (value === null || value === undefined) {
        items.push(
          {label: `Filter: ${column.name} IS NULL`, onClick: filter('IS NULL')},
          {label: `Filter: ${column.name} IS NOT NULL`, onClick: filter('IS NOT NULL')},
        );
      } else {
        items.push(
          {label: `Filter: ${column.name} = ${shown}`, onClick: filter('=')},
          {label: `Filter: ${column.name} <> ${shown}`, onClick: filter('<>')},
        );
      }
      items.push({label: 'Clear filter', onClick: filter('clear')});
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
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onKeyDown}
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
           onOpenReference={props.onOpenReference}
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
          onCancel={props.onCancelQuery}
          ref={footerRef}
        >
          <button
            type="button"
            className="pager-export"
            title="Export rows to file"
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setExportMenu({x: rect.left, y: rect.top - 4});
            }}
          >
            Export
          </button>
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
      {valueEditor && (
        <ValueEditor
          column={valueEditor.column}
          value={getDisplayedRow(changes, getRecords(), valueEditor.rowIndex)[valueEditor.column.key]}
          editable={canEdit && !!valueEditor.column.editable && getRowState(changes, getRecords(), valueEditor.rowIndex) !== 'deleted'}
          onSave={(value) => {
            onCommitEdit(valueEditor.rowIndex, valueEditor.column, value);
            setValueEditor(null);
          }}
          onClose={() => setValueEditor(null)}
        />
      )}
      {exportMenu && (
        <ContextMenu x={exportMenu.x} y={exportMenu.y} items={exportMenuItems()} onClose={() => setExportMenu(null)} />
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
