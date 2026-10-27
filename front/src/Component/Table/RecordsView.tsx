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
import {COPY_FORMATS, CopyFormatType, formatCopy} from './Copy/CopyFormats';
import exportRows, {EXPORT_FORMATS, ExportFormatType} from '../../Library/Export/ExportRows';
import ChartPopup from './Chart/ChartPopup';
import MapPopup, {spatialColumns} from './Map/MapPopup';
import useGridDisplay from './Display/useGridDisplay';
import {GridDisplayContext} from './Display/GridDisplay';
import Popup from '../../UI/Popup/Popup';
import Button from '../../UI/Button/Button';
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
  deleteRows,
  valuesForNewRow,
} from './Edit/PendingChanges';
import PendingChangesBar from './UI/PendingChangesBar';
import ContextMenu, {ContextMenuItem} from '../../UI/ContextMenu/ContextMenu';
import RowForm from './Edit/RowForm';
import ValueEditor from './Edit/ValueEditor';
import CellEditPopup from './Edit/CellEditPopup';
import {binaryLabel, isBinaryColumn, isBinaryValue, isFilterableBinary, isLongText, isLongTextValue} from '../../Library/Record/BinaryValue';
import {isBinary16, uuidOfHex} from '../../Library/Record/Uuid';
import toast from 'react-hot-toast';
import {downloadBinary} from '../../Library/Record/BinaryDownload';
import {describeSelectionStats, selectionStats} from './Copy/SelectionStats';

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
  /** row with values of the form (edited or cloned) - long texts are loaded from it */
  sourceRowIndex?: number;
} | null;

type ContextMenuState = {
  x: number;
  y: number;
  /** null when clicked outside of rows */
  rowIndex: number | null;
  column: ColumnInterface | null;
} | null;

/** RecordsView */
/** grid used last (focus, click) - gets Ctrl+S when focus is on body */
let lastUsedGrid: HTMLDivElement | null = null;

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
  /** "Edit cell…" from context menu - popup with bigger editor than inline one */
  const [cellPopup, setCellPopup] = useState<{rowIndex: number, column: ColumnInterface} | null>(null);
  const [exportMenu, setExportMenu] = useState<{x: number, y: number} | null>(null);
  /** chart / map of loaded rows */
  const [visual, setVisual] = useState<{kind: 'chart' | 'map', rows: SingleRowType[]} | null>(null);
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
  const hasDeletes = Object.keys(changes.deleted).length > 0;
  const [ignoreForeignKeys, setIgnoreForeignKeys] = useState<boolean>(false);
  // option is chosen again for next changes - it is not kept after submit or revert
  useEffect(() => {
    if (!pendingCount) setIgnoreForeignKeys(false);
  }, [pendingCount]);
  const rowChangesOptions = {ignoreForeignKeys: hasDeletes && ignoreForeignKeys};
  // read in reset, which can run before re-render after clearEditing
  const pendingCountRef = useRef<number>(0);
  pendingCountRef.current = pendingCount;
  const canEdit = !!editable && !!props.onSubmitChanges;

  const getRecords = (): SingleRowType[] => dataGridViewRef.current?.getRecords() || [];
  /** rows as shown - with pending changes */
  const loadedRows = (): SingleRowType[] => {
    const records = getRecords();
    return Array.from({length: records.length + changes.inserted.length}, (value, index) => getDisplayedRow(changes, records, index));
  };
  /** image of cell shown big */
  const [image, setImage] = useState<{url: string, title: string} | null>(null);
  const openImage = useCallback((url: string, title: string) => setImage({url, title}), []);
  const gridDisplay = useGridDisplay(props.connection, columns, getRecords, !status.loading, editable, openImage);
  // spatial columns are known when rows are loaded
  const hasSpatial = useMemo(() => !status.loading && spatialColumns(columns, getRecords().slice(0, 50)).length > 0, [columns, status]);

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
    addRows: (rowItems: SingleRowType[]) => {
      dataGridViewRef.current!.addRows(rowItems);
      totalRows.current += rowItems.length;
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

  /**
   * editor of cell or popup was removed - focus fell to body, keyboard shortcuts (Ctrl+S) must go to grid again;
   * after render, so blur of editor is not caused by it
   */
  const focusGrid = useCallback(() => {
    setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body) {
        rootRef.current?.focus({preventScroll: true});
      }
    });
  }, []);

  /** grid callbacks */
  const onCommitEdit = useCallback((rowIndex: number, column: ColumnInterface, value: CellValueType) => {
    setChanges((previous) => setRowValues(previous, getRecords(), rowIndex, {[column.key]: value}));
    setEditingCell(null);
    focusGrid();
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

  /** count, sum, average... of selected cells in footer - more than one cell selected */
  const selectionSummary = useMemo(() => {
    if (!selection) return null;
    const records = getRecords();
    const stats = selectionStats(selection, records.length + changes.inserted.length, columns.map((column) => column.key),
      (rowIndex) => getDisplayedRow(changes, records, rowIndex));
    return stats.cells > 1 ? describeSelectionStats(stats) : null;
  }, [selection, changes, columns]);

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
      // bytes are not typed in narrow cell - value editor has hex, text, UUID and file;
      // long text is loaded whole and edited by value editor
      if (isBinaryColumn(column) || isLongTextValue(getDisplayedRow(changes, getRecords(), rowIndex)[column.key])) {
        setEditingCell(null);
        setValueEditor({rowIndex, column});
        return;
      }
      setEditingCell({rowIndex, columnKey: column.key});
    },
    onCommitEdit,
    onCancelEdit: () => {
      setEditingCell(null);
      focusGrid();
    },
    onContextMenu,
  }), [changes, selectedRow, editingCell, canEdit, selection, onCellMouseDown, onCellMouseEnter, onCommitEdit, onContextMenu]);

  /**
   * displayed rows with long texts of given columns loaded whole - grid has only their beginning;
   * missing = texts which could not be loaded (row without primary key), they stay as label
   */
  const rowsWithWholeTexts = async (rowIndexes: number[], columnIndexes: number[]): Promise<{rows: SingleRowType[], missing: number}> => {
    const records = getRecords();
    let missing = 0;
    const rows = await Promise.all(rowIndexes.map(async (rowIndex) => {
      const row = getDisplayedRow(changes, records, rowIndex);
      const longColumns = columnIndexes.map((index) => columns[index]).filter((column) => isLongText(row[column.key]));
      if (!longColumns.length) return row;
      const whole = {...row};
      await Promise.all(longColumns.map(async (column) => {
        try {
          const loading = gridDisplay.actions.loadText(column, rowIndex);
          if (!loading) throw new Error('Row cannot be identified');
          whole[column.key] = await loading;
        } catch (e) {
          missing++;
        }
      }));
      return whole;
    }));
    return {rows, missing};
  };

  const warnMissingTexts = (missing: number) => {
    if (missing) toast.error(`${missing} long text(s) could not be loaded whole (no primary key) - copied as label`);
  };

  /** rows and columns as text in given format */
  const formatRows = (format: CopyFormatType, rows: SingleRowType[], columnIndexes: number[]): string => {
    return formatCopy(
      format,
      columnIndexes.map((index) => columns[index]),
      rows,
      editable?.table.name,
      props.sqlLiteral,
      Object.keys(gridDisplay.display.transforms).filter((key) => gridDisplay.display.transforms[key] === 'uuid'),
    );
  };

  /**
   * selected cells as text in given format.
   * Ctrl selection does not have to be rectangle - rows and columns with any selected cell are copied.
   */
  const copySelection = async (format: CopyFormatType) => {
    if (!selection) return;
    const rowsCount = getRecords().length + changes.inserted.length;
    const {rows, columns: columnIndexes} = selectedRowsAndColumns(selection, rowsCount);
    const whole = await rowsWithWholeTexts(rows, columnIndexes);
    warnMissingTexts(whole.missing);
    const text = formatRows(format, whole.rows, columnIndexes);
    const cells = rows.length * columnIndexes.length;
    navigator.clipboard?.writeText(text)
      .then(() => toast.success(cells === 1 ? 'Copied' : `Copied ${rows.length} × ${columnIndexes.length} cells`))
      .catch(() => toast.error('Unable to copy'));
  };

  /** whole rows (all columns) with at least one selected cell */
  const copySelectedRows = async (format: CopyFormatType) => {
    if (!selection) return;
    const rowsCount = getRecords().length + changes.inserted.length;
    const {rows} = selectedRowsAndColumns(selection, rowsCount);
    const columnIndexes = columns.map((column, index) => index);
    const whole = await rowsWithWholeTexts(rows, columnIndexes);
    warnMissingTexts(whole.missing);
    const text = formatRows(format, whole.rows, columnIndexes);
    navigator.clipboard?.writeText(text)
      .then(() => toast.success(rows.length === 1 ? 'Copied 1 row' : `Copied ${rows.length} rows`))
      .catch(() => toast.error('Unable to copy'));
  };

  /** rows loaded in grid (current page, with pending changes) as file */
  const exportPage = async (format: ExportFormatType) => {
    const rowsCount = getRecords().length + changes.inserted.length;
    // window for printing must be opened by the click - texts are loaded before
    const printWindow = format === 'pdf' ? window.open('', '_blank') : undefined;
    const whole = await rowsWithWholeTexts(Array.from({length: rowsCount}, (value, index) => index), columns.map((column, index) => index));
    warnMissingTexts(whole.missing);
    const rows = whole.rows;
    if (!exportRows(format, columns, rows, props.exportName || 'export', editable?.table.name, props.sqlLiteral, printWindow)) {
      toast.error('Window for printing was blocked by browser');
      return;
    }
    toast.success(format === 'pdf' ? 'Print dialog opened - choose "Save as PDF"' : `Exported ${rowsCount} row(s)`);
  };

  const exportMenuItems = (): ContextMenuItem[] => {
    const formats = (onClick: (format: ExportFormatType) => void): ContextMenuItem[] => EXPORT_FORMATS
      .map(({format, label}) => ({label, onClick: () => onClick(format)}));
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
    if (ctrl && event.key.toLowerCase() === 's') {
      // browser would save the page
      event.preventDefault();
      if (canEdit && pendingCount > 0 && !props.submitting) {
        onSubmit();
      }
    } else if (ctrl && event.key.toLowerCase() === 'c' && selection) {
      event.preventDefault();
      copySelection('tsv');
    } else if (ctrl && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      const rowsCount = getRecords().length + changes.inserted.length;
      if (rowsCount && columns.length) {
        setSelection([{anchor: {rowIndex: 0, columnIndex: 0}, focus: {rowIndex: rowsCount - 1, columnIndex: columns.length - 1}}]);
      }
    } else if (event.key === 'Delete' && canEdit && selection && !editingCell && !/^(INPUT|TEXTAREA|SELECT)$/.test((event.target as HTMLElement).tagName)) {
      // rows of selected cells are marked for delete, submitted as other changes
      event.preventDefault();
      const records = getRecords();
      const rows = selectedRowsAndColumns(selection, records.length + changes.inserted.length).rows;
      setSelection(null);
      setSelectedRow(null);
      setChanges((previous) => deleteRows(previous, records, rows, false));
    } else if (event.key === 'Escape') {
      setSelection(null);
      setSelectedRow(null);
    }
  };

  // focus is on body (closed popup, removed editor) - Ctrl+S of the last used visible grid is not left to browser
  const onKeyDownRef = useRef(onKeyDown);
  onKeyDownRef.current = onKeyDown;
  useEffect(() => {
    const onWindowKeyDown = (event: globalThis.KeyboardEvent) => {
      const root = rootRef.current;
      const active = document.activeElement;
      if (!root || lastUsedGrid !== root || (active && active !== document.body) || !root.offsetParent) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        onKeyDownRef.current(event as unknown as KeyboardEvent<HTMLDivElement>);
      }
    };
    window.addEventListener('keydown', onWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', onWindowKeyDown);
      if (lastUsedGrid === rootRef.current) lastUsedGrid = null;
    };
  }, []);

  /** row actions */
  const onAddRow = () => setRowForm({title: 'New row', values: valuesForNewRow(columns)});

  const onCloneRow = (rowIndex: number) => {
    const source = getDisplayedRow(changes, getRecords(), rowIndex);
    setRowForm({title: 'Clone row', values: valuesForNewRow(columns, source), sourceRowIndex: rowIndex});
  };

  const onEditRow = (rowIndex: number) => {
    setRowForm({title: 'Edit row', values: getDisplayedRow(changes, getRecords(), rowIndex), rowIndex, sourceRowIndex: rowIndex});
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
  const onPreview = () => props.onPreviewChanges?.(editable!, currentRowChanges(), rowChangesOptions);
  const onSubmit = () => props.onSubmitChanges?.(editable!, currentRowChanges(), rowChangesOptions);

  const copyToClipboard = (value: CellValueType | undefined) => {
    const text = value === null || value === undefined ? 'NULL' : String(value);
    navigator.clipboard?.writeText(text)
      .then(() => toast.success('Copied'))
      .catch(() => toast.error('Unable to copy'));
  };

  /** binary value (BLOB) of cell as file - whole value is loaded from server, grid has only preview */
  const downloadValue = (rowIndex: number, column: ColumnInterface) => {
    const records = getRecords();
    const value = getDisplayedRow(changes, records, rowIndex)[column.key];
    if (!isBinaryValue(value)) return;
    // table-column-key of row (primary key when it is one column), otherwise number of row
    const key = editable?.primaryKey.length === 1 ? records[rowIndex]?.[editable.primaryKey[0]] : undefined;
    const rowName = key !== null && key !== undefined && typeof key !== 'object' ? String(key) : `row${rowIndex + 1}`;
    const baseName = [column.table?.name, column.orgName || column.name, rowName].filter(Boolean).join('-');
    // changed (unsaved) value is not in database - it is not loaded from there
    const changedHere = getRowState(changes, records, rowIndex) === 'inserted' || changes.updated[rowIndex]?.[column.key] !== undefined;
    downloadBinary(value, () => changedHere ? null : gridDisplay.actions.loadBinary(column, rowIndex), baseName)
      .catch((e) => toast.error(e?.message || 'Value could not be downloaded'));
  };

  const contextMenuItems = (menu: NonNullable<ContextMenuState>): ContextMenuItem[] => {
    const items: ContextMenuItem[] = [];
    const records = getRecords();
    const {rowIndex, column} = menu;
    const rowState = rowIndex !== null ? getRowState(changes, records, rowIndex) : null;

    if (rowIndex !== null && column) {
      const value = getDisplayedRow(changes, records, rowIndex)[column.key];
      items.push({label: 'Open value editor…', onClick: () => setValueEditor({rowIndex, column})});
      items.push({label: 'Copy value', onClick: () => isLongText(value)
        ? rowsWithWholeTexts([rowIndex], [columns.findIndex((item) => item.key === column.key)]).then(({rows, missing}) => {
          warnMissingTexts(missing);
          copyToClipboard(rows[0][column.key]);
        })
        : copyToClipboard(isBinary16(value) && gridDisplay.display.transforms[column.key] === 'uuid'
          ? uuidOfHex(value.hex)
          : isBinaryValue(value) ? (value.text ?? `0x${value.hex}`) as any : value)});
      if (isBinaryValue(value)) {
        items.push({label: 'Download value', onClick: () => downloadValue(rowIndex, column)});
      }
      items.push({
        label: 'Copy selection as',
        children: COPY_FORMATS.map(({format, label}) => ({label, hint: format === 'tsv' ? 'Ctrl+C' : undefined, onClick: () => copySelection(format)})),
      });
      items.push({
        label: 'Copy selected rows as',
        children: COPY_FORMATS.map(({format, label}) => ({label, onClick: () => copySelectedRows(format)})),
      });
      // binary key only when it is known whole (preview of long value is not)
      if (column.reference && props.onOpenReference && value !== null && value !== undefined && !(isBinaryValue(value) && value.truncated) && rowState !== 'inserted') {
        items.push(
          {label: `Open ${column.reference.table.name} row`, onClick: () => props.onOpenReference!(column, value, false)},
          {label: `Open ${column.reference.table.name} row in new tab`, onClick: () => props.onOpenReference!(column, value, true)},
        );
      }
    }

    // expressions (no table column) cannot be used in WHERE by their alias
    const filterValue = rowIndex !== null && column ? getDisplayedRow(changes, records, rowIndex)[column.key] : undefined;
    // binary value only when it is short (key, UUID) - files are not compared
    if (rowIndex !== null && column && column.orgName && props.onQuickFilter && (!isBinaryValue(filterValue) || isFilterableBinary(filterValue)) && !isLongText(filterValue)) {
      const value = filterValue;
      const text = isBinaryValue(value) ? binaryLabel(value) : String(value);
      const shown = value === null || value === undefined ? 'NULL' : text.length > 30 ? `${text.slice(0, 30)}…` : text;
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

    if (column) {
      const displayItems = gridDisplay.menuItems(column);
      if (displayItems.length) {
        if (items.length) items.push('separator');
        items.push(...displayItems);
      }
    }

    if (columnsViewRef.current?.hasWidths()) {
      if (items.length) items.push('separator');
      items.push({label: 'Reset column widths', onClick: () => columnsViewRef.current?.resetWidths()});
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
        {label: 'Edit cell…', disabled: !cellEditable, onClick: () => {
          setEditingCell(null);
          setCellPopup({rowIndex, column: column!});
        }},
        {label: 'Set NULL', disabled: !cellEditable || !column?.nullable, onClick: () => onCommitEdit(rowIndex, column!, null)},
        'separator',
        {label: 'Edit row…', onClick: () => onEditRow(rowIndex)},
        {label: 'Clone row…', onClick: () => onCloneRow(rowIndex)},
      );
    }

    // right click on one of more selected rows - action for all of them
    const selectedRows = rowIndex !== null && selection
      ? selectedRowsAndColumns(selection, getRecords().length + changes.inserted.length).rows
      : [];
    if (rowIndex !== null && selectedRows.length > 1 && selectedRows.includes(rowIndex)) {
      const records = getRecords();
      const allDeleted = selectedRows.every((index) => getRowState(changes, records, index) === 'deleted');
      items.push({
        label: allDeleted ? `Undo delete of ${selectedRows.length} rows` : `Delete ${selectedRows.length} selected rows`,
        danger: !allDeleted,
        onClick: () => {
          setSelectedRow(null);
          setSelection(null);
          setChanges((previous) => deleteRows(previous, records, selectedRows, allDeleted));
        },
      });
    } else if (rowIndex !== null) {
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
      onFocus={() => lastUsedGrid = rootRef.current}
      onMouseDown={() => lastUsedGrid = rootRef.current}
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
           sortOrder={props.sortOrder}
           parentRef={dataGridRef}
           widthsKey={props.columnWidthsKey}
         />
         <GridDisplayContext.Provider value={gridDisplay.actions}>
           <DataGrid
             ref={dataGridViewRef}
             cellRender={props.cellRender}
             tabIndex={0}
             parentRef={dataGridRef}
             edit={edit}
             onOpenReference={props.onOpenReference}
             display={gridDisplay.display}
           />
         </GridDisplayContext.Provider>
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
          {selectionSummary && <span className="pager-selection-stats" title="Selected cells - sum, average, minimum and maximum of numbers">{selectionSummary}</span>}
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
          <button
            type="button"
            className="pager-export"
            title="Chart of loaded rows"
            disabled={!columns.length || status.loading}
            onClick={() => setVisual({kind: 'chart', rows: loadedRows()})}
          >
            Chart
          </button>
          {hasSpatial && (
            <button
              type="button"
              className="pager-export"
              title="Geometries of loaded rows on map"
              onClick={() => setVisual({kind: 'map', rows: loadedRows()})}
            >
              Map
            </button>
          )}
          <PendingChangesBar
            canEdit={canEdit}
            readOnlyReason={readOnlyReason}
            pendingCount={pendingCount}
            submitting={!!props.submitting}
            hasDeletes={hasDeletes}
            ignoreForeignKeys={ignoreForeignKeys}
            onIgnoreForeignKeys={setIgnoreForeignKeys}
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
          loadText={rowForm.sourceRowIndex !== undefined ? (column) => gridDisplay.actions.loadText(column, rowForm.sourceRowIndex!) : undefined}
        />
      )}
      {cellPopup && (
        <CellEditPopup
          column={cellPopup.column}
          value={getDisplayedRow(changes, getRecords(), cellPopup.rowIndex)[cellPopup.column.key]}
          onSave={(value) => {
            onCommitEdit(cellPopup.rowIndex, cellPopup.column, value);
            setCellPopup(null);
          }}
          onClose={() => setCellPopup(null)}
          loadText={() => gridDisplay.actions.loadText(cellPopup.column, cellPopup.rowIndex)}
        />
      )}
      {valueEditor && (
        <ValueEditor
          column={valueEditor.column}
          value={getDisplayedRow(changes, getRecords(), valueEditor.rowIndex)[valueEditor.column.key]}
          editable={canEdit && !!valueEditor.column.editable && getRowState(changes, getRecords(), valueEditor.rowIndex) !== 'deleted'}
          asUuid={gridDisplay.display.transforms[valueEditor.column.key] === 'uuid'}
          loadText={() => gridDisplay.actions.loadText(valueEditor.column, valueEditor.rowIndex)}
          onSave={(value) => {
            // binary value is kept in the same form as values from server
            onCommitEdit(valueEditor.rowIndex, valueEditor.column, value as CellValueType);
            setValueEditor(null);
          }}
          onClose={() => setValueEditor(null)}
          onDownload={() => downloadValue(valueEditor.rowIndex, valueEditor.column)}
        />
      )}
      {image && (
        <Popup openOnMount label={image.title} onClickOk={() => setImage(null)} onClose={() => setImage(null)} buttons={[<Button key="close" size="small" label="Close" onClick={() => setImage(null)} />]}>
          <div className="cmp-image-preview"><img src={image.url} alt={image.title} /></div>
        </Popup>
      )}
      {visual?.kind === 'chart' && <ChartPopup columns={columns} rows={visual.rows} name={props.exportName || 'result'} onClose={() => setVisual(null)} />}
      {visual?.kind === 'map' && <MapPopup columns={columns} rows={visual.rows} name={props.exportName || 'result'} onClose={() => setVisual(null)} />}
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
