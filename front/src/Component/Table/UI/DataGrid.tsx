import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import DataGridPropsInterface from '../Interface/DataGridPropsInterface';
import Row from './Row';
import DataGridRefInterface from '../Interface/DataGridRefInterface';
import {SingleRowType} from '../Interface/RecordsViewPropsInterface';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {getRowState} from '../Edit/PendingChanges';
import {GridHandlersInterface, selectedColumnsOfRow} from '../Interface/GridEditInterface';

/**
 * callback of ResizeObserver runs in next frame - state changed directly in callback changes layout of observed
 * elements in the same frame and browser reports "ResizeObserver loop completed with undelivered notifications"
 */
const inNextFrame = (callback: () => void) => {
  let frame: number | null = null;
  return {
    run: () => {
      if (frame === null) {
        frame = requestAnimationFrame(() => {
          frame = null;
          callback();
        });
      }
    },
    cancel: () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
};

/** DataGrid */
export default forwardRef<DataGridRefInterface|null, DataGridPropsInterface>((props: DataGridPropsInterface, ref) => {

  const [records, setRecords] = useState<SingleRowType[]>([]);
  const [columns, setColumns] = useState<ColumnInterface[]>([]);
  const [topScroll, setTopScroll] = useState<number>(0);

  /**
   * rows come one by one from websocket - they are collected and added once per frame,
   * otherwise every row re-renders whole grid
   */
  const pendingRows = useRef<SingleRowType[]>([]);
  const flushFrame = useRef<number | null>(null);
  const recordsRef = useRef<SingleRowType[]>(records);
  recordsRef.current = records;

  const takePendingRows = (): SingleRowType[] => {
    if (flushFrame.current !== null) {
      cancelAnimationFrame(flushFrame.current);
      flushFrame.current = null;
    }
    const rows = pendingRows.current;
    pendingRows.current = [];
    return rows;
  };

  useEffect(() => () => {
    if (flushFrame.current !== null) cancelAnimationFrame(flushFrame.current);
  }, []);

  useImperativeHandle(ref, () => ({
    addRow: (rowItem: SingleRowType) => {
      pendingRows.current.push(rowItem);
      if (flushFrame.current === null) {
        flushFrame.current = requestAnimationFrame(() => {
          flushFrame.current = null;
          const rows = takePendingRows();
          if (rows.length) {
            setRecords((prefState: SingleRowType[]) => prefState.concat(rows));
          }
        });
      }
    },
    addRows: (rowItems: SingleRowType[]) => {
      const rows = takePendingRows().concat(rowItems);
      if (rows.length) {
        setRecords((prefState: SingleRowType[]) => prefState.concat(rows));
      }
    },
    setColumns: (columns: ColumnInterface[]) => {
      setColumns(columns);
    },
    reset: (keepScroll?: boolean) => {
      takePendingRows();
      setColumns([]);
      setRecords([]);
      if (!keepScroll) {
        setTopScroll(0);
      }
    },
    applyChanges: (updated: {[rowIndex: number]: SingleRowType}, deleted: number[]) => {
      const deletedRows = new Set(deleted);
      const rows = takePendingRows();
      setRecords((previous) => previous.concat(rows)
        .map((record, index) => updated[index] ? {...record, ...updated[index]} : record)
        .filter((record, index) => !deletedRows.has(index)));
    },
    getRecords: () => pendingRows.current.length ? recordsRef.current.concat(pendingRows.current) : recordsRef.current,

  } as DataGridRefInterface));

  const mainTableContentContainer = useRef<HTMLDivElement|null>(null);
  const [sizeTableContent, setSizeTableContent] = useState({width: 0, height: 0});

  const rowHeight = 21;

  const changes = props.edit?.changes;
  const rowsCount = records.length + (changes?.inserted.length || 0);

  /** scroll to the end when new row was added, so it is visible */
  const insertedCount = changes?.inserted.length || 0;
  const previousInsertedCount = useRef<number>(insertedCount);
  useEffect(() => {
    if (insertedCount > previousInsertedCount.current && sizeTableContent.height) {
      const visibleRows = Math.floor(sizeTableContent.height / rowHeight);
      setTopScroll(Math.max(0, rowsCount - visibleRows));
    }
    previousInsertedCount.current = insertedCount;
  }, [insertedCount]);

  const scrollHandle = useCallback((event: WheelEvent) => {
    // Shift + wheel and horizontal wheel (touchpad) scroll columns - left to browser, rows stay
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      return;
    }

    setTopScroll((prevState) => {

      if (rowsCount === 0) {
        return prevState;
      }

      const newState = Math.ceil(prevState + (event.deltaY / 10));
      if (newState <= 0) {
        return 0
      }
      if (rowsCount < newState) {
        return prevState;
      }

      const leftToShow = rowsCount - prevState;
      if (leftToShow * rowHeight < sizeTableContent.height && newState > prevState) {
        return prevState;
      }

      return newState;
    });
  }, [rowsCount, sizeTableContent]);

  useEffect(() => {
    if (mainTableContentContainer.current) {
      mainTableContentContainer.current.onwheel =  scrollHandle;
    }
  }, [scrollHandle]);

  useEffect(() => {
    const element = mainTableContentContainer.current;
    const measureSize = () => {
      if (element) {
        const rect = element.getBoundingClientRect();
        setSizeTableContent((previous) => previous.width === rect.width && previous.height === rect.height
          ? previous
          : {width: rect.width, height: rect.height});
      }
    };
    const scheduled = inNextFrame(measureSize);
    const observer = new ResizeObserver(scheduled.run);

    if (element) {
      measureSize();
      observer.observe(element);
    }

    return () => {
      scheduled.cancel();
      observer.disconnect();
    };

  }, []);

  /** widths of columns are measured from header once (and on resize), not by every cell */
  const [widths, setWidths] = useState<number[]>([]);
  useLayoutEffect(() => {
    const headerRow = props.parentRef.current?.querySelector('.header-columns-row');
    if (!headerRow || !columns.length) {
      return;
    }
    const measure = () => {
      const next = Array.from(headerRow.children).map((cell) => cell.getBoundingClientRect().width);
      setWidths((previous) => previous.length === next.length && previous.every((width, index) => width === next[index]) ? previous : next);
    };
    measure();
    const scheduled = inNextFrame(measure);
    const observer = new ResizeObserver(scheduled.run);
    observer.observe(headerRow);
    Array.from(headerRow.children).forEach((cell) => observer.observe(cell));
    return () => {
      scheduled.cancel();
      observer.disconnect();
    };
  }, [columns]);

  /** only columns visible in horizontal scroll (and few around) are rendered, the rest is replaced by spacers */
  const [visibleColumns, setVisibleColumns] = useState<[number, number] | null>(null);
  useLayoutEffect(() => {
    // .cmp-data-grid is the element scrolled horizontally
    const scroller = props.parentRef.current;
    if (!scroller || !widths.length) {
      setVisibleColumns(null);
      return;
    }
    const overscan = 3;
    const update = () => {
      const left = scroller.scrollLeft;
      const right = left + scroller.clientWidth;
      let position = 0;
      let first = 0;
      let last = widths.length - 1;
      for (let index = 0; index < widths.length; index++) {
        const end = position + widths[index];
        if (end < left) first = index + 1;
        if (position <= right) last = index;
        position = end;
      }
      const range: [number, number] = [Math.max(0, first - overscan), Math.min(widths.length - 1, last + overscan)];
      setVisibleColumns((previous) => previous && previous[0] === range[0] && previous[1] === range[1] ? previous : range);
    };
    update();
    scroller.addEventListener('scroll', update, {passive: true});
    const scheduled = inNextFrame(update);
    const observer = new ResizeObserver(scheduled.run);
    observer.observe(scroller);
    return () => {
      scroller.removeEventListener('scroll', update);
      scheduled.cancel();
      observer.disconnect();
    };
  }, [widths]);

  /** callbacks are the same object for whole life of grid - memoized rows are not re-rendered because of them */
  const editRef = useRef(props.edit);
  editRef.current = props.edit;
  const openReferenceRef = useRef(props.onOpenReference);
  openReferenceRef.current = props.onOpenReference;
  const handlers: GridHandlersInterface = useMemo(() => ({
    onSelectRow: (rowIndex) => editRef.current?.onSelectRow(rowIndex),
    onStartEdit: (rowIndex, column) => editRef.current?.onStartEdit(rowIndex, column),
    onCommitEdit: (rowIndex, column, value) => editRef.current?.onCommitEdit(rowIndex, column, value),
    onCancelEdit: () => editRef.current?.onCancelEdit(),
    onCellMouseDown: (rowIndex, columnIndex, mode) => editRef.current?.onCellMouseDown(rowIndex, columnIndex, mode),
    onCellMouseEnter: (rowIndex, columnIndex) => editRef.current?.onCellMouseEnter(rowIndex, columnIndex),
    onContextMenu: (event, rowIndex, column) => editRef.current?.onContextMenu(event, rowIndex, column),
    onOpenReference: (column, value, newTab) => openReferenceRef.current?.(column, value, newTab),
  }), []);

  const edit = props.edit;
  const displayRow = (index: number) => {
    if (rowsCount <= index) {
      return null;
    }
    const isInserted = index >= records.length;
    const record = isInserted ? (changes?.inserted[index - records.length] || {}) : records[index];

    return (
      <Row
        key={index}
        cellRender={props.cellRender}
        tabIndex={props.tabIndex}
        record={record}
        rowIndex={index}
        rowState={changes ? getRowState(changes, records, index) : 'normal'}
        changedValues={isInserted ? undefined : changes?.updated[index]}
        columns={columns}
        widths={widths}
        visibleColumns={visibleColumns}
        hasEdit={!!edit}
        canEdit={!!edit?.canEdit}
        selected={edit?.selectedRow === index}
        selectedColumns={selectedColumnsOfRow(edit?.selection || null, index)}
        editingColumnKey={edit?.editingCell?.rowIndex === index ? edit.editingCell.columnKey : null}
        hasReference={!!props.onOpenReference}
        handlers={handlers}
      />
    );
  };

  const renderElements = () => {
    const collections = [];
    if (sizeTableContent.height) {
      const calcMaxRows = Math.ceil((sizeTableContent.height)/rowHeight);
      const maxRows = Math.min(calcMaxRows, rowsCount);
      for (let i: number = 0; i < maxRows; i++) {
        collections.push(displayRow(i+topScroll));
      }
    }
    return collections;
  };

  return (
    <div
      className="data-table-content"
      ref={mainTableContentContainer}
      onContextMenu={props.edit ? (event) => {
        event.preventDefault();
        props.edit!.onContextMenu(event, null, null);
      } : undefined}
    >
      <div className="data-table-content-wrapper">
        <div className="data-table-content-window">
          {renderElements()}
        </div>
      </div>
    </div>
  );
});

