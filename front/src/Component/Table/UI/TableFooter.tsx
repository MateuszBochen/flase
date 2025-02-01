import React, {forwardRef, useImperativeHandle, useRef, useState} from 'react';
import TableFooterPropsInterface from '../../Application/TableRecords/Interface/TableFooterPropsInterface';
import IconButton from '../../../UI/Button/IconButton';
import {faCircleChevronLeft, faCircleChevronRight} from '@fortawesome/free-solid-svg-icons';
import TableFooterRefInterface from '../../Application/TableRecords/Interface/TableFooterRefInterface';

/** TableFooter */
export default forwardRef<TableFooterRefInterface, TableFooterPropsInterface>((props: TableFooterPropsInterface, ref) => {
  const perPageRef = useRef<number>(100);
  const [localInputPageValue, setLocalInputPageValue] = useState<number>(0);

  const [offset, setOffset] = useState<number>(0);
  const [length, setLength] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const [allPages, setAllPages] = useState<number>(0);

  useImperativeHandle(ref, () => ({
    setLimit: (offset: number, perPage: number) => {
      setOffset(offset);
      perPageRef.current = perPage;
      setPage(Math.floor(offset/perPage));
      setLocalInputPageValue(Math.floor(offset/perPage));
      setAllPages(Math.ceil(total/perPage));
    },
    setLength: (length: number) => setLength(length),
    setTotal: (total: number) => {
      setTotal(total);
      setAllPages(Math.ceil(total/perPageRef.current));
    },
  } as TableFooterRefInterface));

  const showsFrom = offset;
  const showsTo = (length + showsFrom);

  return (
    <div className="cmp-records-view-pager-root">
      <div className="cmp-records-view-pager-item pager">
        <IconButton
          disabled={false}
          icon={faCircleChevronLeft}
          onClick={() => {
            props.onPageChange(page-1, perPageRef.current, allPages)
          }}
        />
        <IconButton
          disabled={false}
          icon={faCircleChevronRight}
          onClick={() => {
            props.onPageChange(page+1, perPageRef.current, allPages)
          }}
        />
        <input
          className="form-control"
          type="number"
          value={localInputPageValue}
          onChange={(e) => setLocalInputPageValue(parseInt(e.target.value))}
          onKeyUp={(e) => {
              if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                props.onPageChange(localInputPageValue, perPageRef.current, allPages);
              }
          }}
        />
      </div>
      <div className="cmp-records-view-pager-item pager-info">
        <div>
          Page: {page} &nbsp;/&nbsp; {allPages},
        </div>
        <div>
          &nbsp; Records: &nbsp; {showsFrom} - {showsTo}
          &nbsp;/&nbsp;{total}
        </div>
      </div>
    </div>
  );
});
