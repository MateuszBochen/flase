import React, {forwardRef, MouseEvent, useCallback, useEffect, useImperativeHandle, useRef, useState} from 'react';
import HeaderColumnsPropsInterface from '../Interface/HeaderColumnsPropsInterface';
import HeaderColumn from './HeaderColumn';
import HeaderColumnsRefInterface from '../Interface/HeaderColumnsRefInterface';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import HeaderSkeleton from './Skeleton/HeaderSkeleton';
import ColumnWidths, {ColumnWidthsType} from '../../../Library/Table/ColumnWidths';

const MIN_WIDTH = 40;
const MAX_FIT_WIDTH = 600;

/** width of text itself - element can be wider (fixed width of cell) or narrower (cut by ellipsis) */
const textWidth = (element: Element | null): number => {
  if (!element) return 0;
  const range = document.createRange();
  range.selectNodeContents(element);
  return range.getBoundingClientRect().width;
};

/** same name can be in result more times (JOIN) */
const columnKey = (column: ColumnInterface, index: number) => `${column.alias}-${column.name}-${index}`;
/** remembered widths are keyed by name of table column */
const columnName = (column: ColumnInterface) => column.orgName || column.name;

export default forwardRef<HeaderColumnsRefInterface|null, HeaderColumnsPropsInterface>((props: HeaderColumnsPropsInterface, ref) => {

  const [columns, setColumns] = useState<ColumnInterface[]>([]);
  /** widths set by user (key of column -> px); columns without width share the rest of row */
  const [widths, setWidths] = useState<{[key: string]: number}>({});
  const rowRef = useRef<HTMLDivElement | null>(null);
  const stopResize = useRef<(() => void) | null>(null);
  const widthsRef = useRef(widths);
  widthsRef.current = widths;
  const columnsRef = useRef(columns);
  columnsRef.current = columns;

  /** widths of shown columns are remembered for table */
  const remember = (newWidths: {[key: string]: number}) => {
    if (!props.widthsKey) return;
    const byName: ColumnWidthsType = {};
    columnsRef.current.forEach((column, index) => {
      const width = newWidths[columnKey(column, index)];
      if (width) byName[columnName(column)] = width;
    });
    ColumnWidths.save(props.widthsKey, byName);
  };

  useImperativeHandle(ref, () => ({
    setColumns: (newColumns: ColumnInterface[]) => {
      setColumns(newColumns);
      if (props.widthsKey) {
        // remembered widths of this table
        const stored = ColumnWidths.load(props.widthsKey);
        const restored: {[key: string]: number} = {};
        newColumns.forEach((column, index) => {
          const width = stored[columnName(column)];
          if (typeof width === 'number' && width >= MIN_WIDTH) restored[columnKey(column, index)] = width;
        });
        setWidths(restored);
        return;
      }
      // the same columns (sort, other page, reload) keep widths, other result starts automatic
      setWidths((previous) => {
        const keys = new Set(newColumns.map(columnKey));
        const kept = Object.entries(previous).filter(([key]) => keys.has(key));
        return kept.length === Object.keys(previous).length ? previous : Object.fromEntries(kept);
      });
    },
    reset: () => setColumns([]),
    hasWidths: () => Object.keys(widthsRef.current).length > 0,
    resetWidths: () => {
      setWidths({});
      if (props.widthsKey) ColumnWidths.clear(props.widthsKey);
    },
  } as HeaderColumnsRefInterface));

  useEffect(() => () => stopResize.current?.(), []);

  /** widths of all columns as they are shown now - first resize freezes them, so other columns do not shrink */
  const currentWidths = useCallback((): {[key: string]: number} => {
    const cells = Array.from(rowRef.current?.children || []) as HTMLElement[];
    return Object.fromEntries(columns.map((column, index) => [columnKey(column, index), cells[index]?.getBoundingClientRect().width || MIN_WIDTH]));
  }, [columns]);

  const onResizeStart = (index: number) => (event: MouseEvent) => {
    if (event.button !== 0) return;
    // no sort, no text selection, no grid selection
    event.preventDefault();
    event.stopPropagation();
    const key = columnKey(columns[index], index);
    const frozen = {...currentWidths(), ...widths};
    const startX = event.clientX;
    const startWidth = frozen[key];
    setWidths(frozen);

    const onMove = (moveEvent: globalThis.MouseEvent) => {
      const width = Math.max(MIN_WIDTH, Math.round(startWidth + moveEvent.clientX - startX));
      setWidths((previous) => previous[key] === width ? previous : {...previous, [key]: width});
    };
    const stop = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', stop);
      document.body.classList.remove('column-resizing');
      stopResize.current = null;
      remember(widthsRef.current);
    };
    stopResize.current?.();
    stopResize.current = stop;
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', stop);
    document.body.classList.add('column-resizing');
  };

  /** width of the longest shown value (rendered rows) or of the name */
  const onResizeFit = (index: number) => () => {
    const header = rowRef.current?.children[index] as HTMLElement | undefined;
    if (!header) return;
    const sort = header.querySelector('.sort-box') as HTMLElement | null;
    // padding of wrapper + margin of name + border
    let width = textWidth(header.querySelector('.column-name')) + (sort?.offsetWidth || 0) + 12;
    props.parentRef.current?.querySelectorAll(`.data-table-cell[data-col="${index}"] .dtc-content`).forEach((content) => {
      // padding of content + border of cell
      width = Math.max(width, textWidth(content) + 8);
    });
    const key = columnKey(columns[index], index);
    const newWidths = {...currentWidths(), ...widths, [key]: Math.min(MAX_FIT_WIDTH, Math.max(MIN_WIDTH, Math.ceil(width)))};
    setWidths(newWidths);
    remember(newWidths);
  };

  if (columns.length === 0) {
    return <HeaderSkeleton />
  }

  return (
    <div className="header-columns-row" ref={rowRef}>
      {columns.map((column, index) => (<HeaderColumn
        column={column}
        onSort={props.onSort}
        key={columnKey(column, index)}
        gridRef={props.parentRef}
        width={widths[columnKey(column, index)]}
        onResizeStart={onResizeStart(index)}
        onResizeFit={onResizeFit(index)}
      />))}
    </div>
  );
});
