import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import DataGridPropsInterface from '../Interface/DataGridPropsInterface';
import Row from './Row';
import DataGridRefInterface from '../Interface/DataGridRefInterface';
import {SingleRowType} from '../Interface/RecordsViewPropsInterface';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import {getDisplayedRow, getRowState} from '../Edit/PendingChanges';

/** DataGrid */
export default forwardRef<DataGridRefInterface|null, DataGridPropsInterface>((props: DataGridPropsInterface, ref) => {

  const [records, setRecords] = useState<SingleRowType[]>([]);
  const [columns, setColumns] = useState<ColumnInterface[]>([]);
  const [topScroll, setTopScroll] = useState<number>(0);
  const leftShiftIsPressed = useRef<boolean>(false);

  useImperativeHandle(ref, () => ({
    addRow: (rowItem: SingleRowType) => {
      setRecords((prefState: SingleRowType[]) => [...prefState, rowItem]);
    },
    setColumns: (columns: ColumnInterface[]) => {
      setColumns(columns);
    },
    reset: (keepScroll?: boolean) => {
      setColumns([]);
      setRecords([]);
      if (!keepScroll) {
        setTopScroll(0);
      }
    },
    applyChanges: (updated: {[rowIndex: number]: SingleRowType}, deleted: number[]) => {
      const deletedRows = new Set(deleted);
      setRecords((previous) => previous
        .map((record, index) => updated[index] ? {...record, ...updated[index]} : record)
        .filter((record, index) => !deletedRows.has(index)));
    },
    getRecords: () => records,

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

    setTopScroll((prevState) => {
      if (leftShiftIsPressed.current) {
        return prevState;
      }


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

  const onKeyDownHandler = useCallback((event: KeyboardEvent) => {
    if (event.code === 'ShiftLeft') {
      leftShiftIsPressed.current = !leftShiftIsPressed.current;
    }

  }, []);

  useEffect(() => {
    if (mainTableContentContainer.current) {
      mainTableContentContainer.current.onwheel =  scrollHandle;
      document.onkeydown =  onKeyDownHandler;
      document.onkeyup =  onKeyDownHandler;
    }
  }, [rowsCount, sizeTableContent]);

  useEffect(() => {
    const observer = new ResizeObserver((entries: ResizeObserverEntry[]) => {
      entries.forEach((entry) => {
        setSizeTableContent({
          width: entry.target.getBoundingClientRect().width,
          height: entry.target.getBoundingClientRect().height
        });
      });
    });

    if (mainTableContentContainer.current) {
      setSizeTableContent({
        width: mainTableContentContainer.current.getBoundingClientRect().width,
        height: mainTableContentContainer.current.getBoundingClientRect().height
      });
      observer.observe(mainTableContentContainer.current);
    }

     return () => {
       if (mainTableContentContainer.current) observer.unobserve(mainTableContentContainer.current);
     }

  }, []);

  const displayRow = useCallback((index: number) => {

    if (rowsCount <= index) {
      return null;
    }

    const rowItem = changes ? getDisplayedRow(changes, records, index) : records[index];

    return (
      <Row
        cellRender={props.cellRender}
        tabIndex={props.tabIndex}
        rowItem={rowItem}
        rowIndex={index}
        rowState={changes ? getRowState(changes, records, index) : 'normal'}
        changedValues={changes?.updated[index]}
        edit={props.edit}
        columns={columns}
        key={index}
        gridRef={props.parentRef}
      />
    );
  }, [columns, records, rowsCount, props.edit]);


  const renderElements = useCallback(() => {
    const collections = [];
    if (sizeTableContent.height) {
      const calcMaxRows = Math.ceil((sizeTableContent.height)/rowHeight);
      const maxRows = Math.min(calcMaxRows, rowsCount);
      if (maxRows > 0) {
        for (let i: number = 0; i < maxRows; i++) {
          collections.push(displayRow(i+topScroll));
        }
      }
    }
    return collections;
  }, [columns, records, rowsCount, sizeTableContent, topScroll, displayRow]);

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

