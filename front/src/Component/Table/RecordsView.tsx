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

/** RecordsView */
export default forwardRef<RecordsViewRefInterface|null, RecordsViewPropsInterface>((props, ref) => {

  const dataGridRef = useRef<HTMLDivElement|null>(null);
  const columnsViewRef = useRef<HeaderColumnsRefInterface|null>(null);
  const dataGridViewRef = useRef<DataGridRefInterface|null>(null);


  useImperativeHandle(ref, () => ({
    addRow: (rowItem: SingleRowType) => {
      dataGridViewRef.current!.addRow(rowItem);
    },
    setColumns: (columns: ColumnInterface[]) => {
      columnsViewRef.current!.setColumns(columns);
      dataGridViewRef.current!.setColumns(columns);
    }

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
           onSort={() => {}}
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
          onPageChange={() => {}}
        />
      </div>
    </div>
  );
});
