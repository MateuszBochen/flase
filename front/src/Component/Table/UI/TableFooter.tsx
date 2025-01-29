import React, {Component, forwardRef, useImperativeHandle, useState} from 'react';
import TableFooterPropsInterface from '../../Application/TableRecords/Interface/TableFooterPropsInterface';
import IconButton from '../../../UI/Button/IconButton';
import {faCircleChevronLeft, faCircleChevronRight} from '@fortawesome/free-solid-svg-icons';
import TableFooterRefInterface from '../../Application/TableRecords/Interface/TableFooterRefInterface';





/** TableFooter */
export default forwardRef<TableFooterRefInterface, TableFooterPropsInterface>((props: TableFooterPropsInterface, ref) => {

  const [page, setPage] = useState<number>(0);
  const [length, setLength] = useState<number>(0);
  const [perPage, setPerPage] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);

  useImperativeHandle(ref, () => ({
    setPage: (page: number) => setPage(page),
    setLength: (length: number) => setLength(length),
    setPerPage: (perPage: number) => setPerPage(perPage),
    setTotal: (total: number) => setTotal(total),
  } as TableFooterRefInterface));


  return (
    <div className="cmp-records-view-pager-root">

      <div className="cmp-records-view-pager-item pager">
        <IconButton
          disabled={false}
          icon={faCircleChevronLeft}
          onClick={() => {
          }}
        />
        <IconButton
          disabled={false}
          icon={faCircleChevronRight}
          onClick={() => {
          }}
        />
        <input
          className="form-control"
          type="number"
          /*value={currentPage}*/
          /*onChange={(e) => this.setState({currentPage: e.target.value})}*/
          /*onKeyPress={(e) => {
              if (e.key === 'Enter') {
                  this.onChangePageHandler(e.target.value - 1);
                  e.target.select();
              }
          }}*/
        />
      </div>

      <div className="cmp-records-view-pager-item pager-info">
        <div>
          Page: {page} &nbsp;/&nbsp; {Math.ceil(total / perPage)}
        </div>
        <div>
          &nbsp; Records: &nbsp; {page * perPage - (length) + (page * perPage)}
          &nbsp;/&nbsp;{total}
        </div>
      </div>
    </div>
  );
});
