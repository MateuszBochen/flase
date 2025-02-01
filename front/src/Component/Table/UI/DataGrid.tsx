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
    reset: () => {
      setColumns([]);
      setRecords([]);
      setTopScroll(0);
    }

  } as DataGridRefInterface));

  const mainTableContentContainer = useRef<HTMLDivElement|null>(null);
  const [sizeTableContent, setSizeTableContent] = useState({width: 0, height: 0});

  const rowHeight = 21;

  const scrollHandle = useCallback((event: WheelEvent) => {

    setTopScroll((prevState) => {
      if (leftShiftIsPressed.current) {
        return prevState;
      }


      if (records.length === 0) {
        return prevState;
      }

      const newState = Math.ceil(prevState + (event.deltaY / 10));
      if (newState <= 0) {
        return 0
      }
      if (records.length < newState) {
        return prevState;
      }

      const leftToShow = records.length - prevState;
      if (leftToShow * rowHeight < sizeTableContent.height && newState > prevState) {
        return prevState;
      }

      return newState;
    });
  }, [records, sizeTableContent]);

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
  }, [records, sizeTableContent]);

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

    if (records.length <= index) {
      return null;
    }

    return (
      <Row
        cellRender={props.cellRender}
        tabIndex={props.tabIndex}
        rowItem={records[index]}
        columns={columns}
        key={index}
        gridRef={props.parentRef}
      />
    );
  }, [columns, records]);


  const renderElements = useCallback(() => {
    const collections = [];
    if (sizeTableContent.height) {
      const calcMaxRows = Math.ceil((sizeTableContent.height)/rowHeight);
      const maxRows = Math.min(calcMaxRows, records.length);
      if (maxRows > 0) {
        for (let i: number = 0; i < maxRows; i++) {
          collections.push(displayRow(i+topScroll));
        }
      }
    }
    return collections;
  }, [columns, records, sizeTableContent, topScroll]);

  return (
    <div className="data-table-content" ref={mainTableContentContainer}>
      <div className="data-table-content-wrapper">
        <div className="data-table-content-window">
          {renderElements()}
        </div>
      </div>
    </div>
  );
});

