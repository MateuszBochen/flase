import RecordsViewPropsInterface, {SingleRowType} from './Interface/RecordsViewPropsInterface';
import './style.css';
import TableFooter from './UI/TableFooter';
import HeaderColumns from './UI/HeaderColumns';
import React, {forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState} from 'react';
import RecordsViewRefInterface from './Interface/RecordsViewRefInterface';
import HeaderColumnsRefInterface from './Interface/HeaderColumnsRefInterface';
import ColumnInterface from '../../Library/Table/Interface/ColumnInterface';
import DataGrid from './UI/DataGrid';
import DataGridRefInterface from './Interface/DataGridRefInterface';
import TableFooterRefInterface from '../Application/TableRecords/Interface/TableFooterRefInterface';

/** RecordsView */
export default forwardRef<RecordsViewRefInterface|null, RecordsViewPropsInterface>((props, ref) => {

  const totalRows = useRef<number>(0);
  const dataGridRef = useRef<HTMLDivElement|null>(null);
  const columnsViewRef = useRef<HeaderColumnsRefInterface|null>(null);
  const dataGridViewRef = useRef<DataGridRefInterface|null>(null);
  const footerRef = useRef<TableFooterRefInterface|null>(null);


  useImperativeHandle(ref, () => ({
    addRow: (rowItem: SingleRowType) => {
      dataGridViewRef.current!.addRow(rowItem);
      totalRows.current = totalRows.current += 1;
      footerRef.current!.setLength(totalRows.current);
    },
    setColumns: (columns: ColumnInterface[]) => {
      columnsViewRef.current!.setColumns(columns);
      dataGridViewRef.current!.setColumns(columns);
    },
    reset: (option?: string) => {
      if (option !== 'records') {
        columnsViewRef.current!.reset();
      }
      dataGridViewRef.current!.reset();
      footerRef.current!.setLength(0);
      footerRef.current!.setTotal(0);
      footerRef.current!.setLimit(0, 100);
      // footerRef.current!.setPerPage(100);
      totalRows.current = 0;
    },
    setLimit: footerRef.current?.setLimit,
    setTotal: footerRef.current?.setTotal,

  } as RecordsViewRefInterface));

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
         />
       </div>
      </div>
      <div className="cmp-records-view-pager">
        <TableFooter
          onPageChange={props.onPageChange}
          ref={footerRef}
        />
      </div>
    </div>
  );
});
