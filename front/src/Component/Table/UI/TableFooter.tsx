import React, {forwardRef, useImperativeHandle, useState} from 'react';
import TableFooterPropsInterface from '../../Application/TableRecords/Interface/TableFooterPropsInterface';
import IconButton from '../../../UI/Button/IconButton';
import {faCircleChevronLeft, faCircleChevronRight} from '@fortawesome/free-solid-svg-icons';
import TableFooterRefInterface from '../../Application/TableRecords/Interface/TableFooterRefInterface';
import formatCount from '../../../Library/Record/formatCount';

const formatMs = (ms: number): string => ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;

type CountStateType = {total: number | null, estimated: boolean, countMs?: number, cached?: boolean};

/** TableFooter */
export default forwardRef<TableFooterRefInterface, TableFooterPropsInterface>((props: TableFooterPropsInterface, ref) => {
  const [localInputPageValue, setLocalInputPageValue] = useState<number>(0);

  const [offset, setOffset] = useState<number>(0);
  const [perPage, setPerPage] = useState<number>(100);
  const [length, setLength] = useState<number>(0);
  const [count, setCount] = useState<CountStateType>({total: null, estimated: false});
  /** exact count requested by user is running */
  const [counting, setCounting] = useState<boolean>(false);

  useImperativeHandle(ref, () => ({
    setLimit: (offset: number, perPage: number) => {
      setOffset(offset);
      setPerPage(perPage);
      setLocalInputPageValue(Math.floor(offset/perPage));
    },
    setLength: (length: number) => setLength(length),
    adjustTotal: (difference: number) => {
      setCount((previous) => previous.total === null ? previous : {...previous, total: Math.max(0, previous.total + difference)});
    },
    setTotal: (total, info) => {
      setCounting(false);
      // failed exact count keeps the estimate
      if (info?.error) return;
      setCount({total, estimated: !!info?.estimated, countMs: info?.countMs, cached: info?.cached});
    },
  } as TableFooterRefInterface));

  const page = Math.floor(offset / perPage);
  const known = count.total !== null && !count.estimated;
  const allPages = count.total !== null ? Math.ceil(count.total / perPage) : null;
  /** without exact count the next page exists while pages are full */
  const maxPages = known ? allPages! : Math.max(allPages ?? 0, length >= perPage ? page + 1 : page);
  const changePage = (newPage: number) => props.onPageChange(newPage, perPage, maxPages);

  const showsFrom = offset;
  const showsTo = (length + showsFrom);

  const totalTitle = count.estimated
    ? `Estimate of database - exact count takes more than 3 s${count.countMs !== undefined ? ` (estimated in ${formatMs(count.countMs)})` : ''}`
    : count.total === null ? 'Counting rows…'
      : count.cached ? 'Counted a moment ago - Refresh counts again'
        : count.countMs !== undefined ? `Counted in ${formatMs(count.countMs)}` : undefined;
  const totalText = count.total === null ? (count.estimated ? '?' : '…') : `${count.estimated ? '≈ ' : ''}${formatCount(count.total)}`;

  return (
    <div className="cmp-records-view-pager-root">
      <div className="cmp-records-view-pager-item pager">
        <IconButton
          disabled={false}
          icon={faCircleChevronLeft}
          onClick={() => {
            changePage(page - 1)
          }}
        />
        <IconButton
          disabled={false}
          icon={faCircleChevronRight}
          onClick={() => {
            changePage(page + 1)
          }}
        />
        <input
          className="form-control"
          type="number"
          value={localInputPageValue}
          onChange={(e) => setLocalInputPageValue(parseInt(e.target.value))}
          onKeyUp={(e) => {
              if (e.key === 'Enter' || e.key === 'NumpadEnter') {
                changePage(localInputPageValue);
              }
          }}
        />
      </div>
      <div className="cmp-records-view-pager-item pager-info">
        <div>
          Page: {page} &nbsp;/&nbsp; {allPages === null ? '?' : `${count.estimated ? '≈ ' : ''}${formatCount(allPages)}`},
        </div>
        <div>
          &nbsp; Records: &nbsp; {showsFrom} - {showsTo}
          &nbsp;/&nbsp;<span className={`pager-total${count.estimated ? ' estimated' : ''}`} title={totalTitle}>{totalText}</span>
        </div>
        {counting ? (
          <div className="pager-loading">
            &nbsp; Counting…
            {props.onCancel && <button type="button" className="pager-cancel" title="Stop count (KILL QUERY)" onClick={props.onCancel}>Cancel</button>}
          </div>
        ) : count.estimated && props.onCountExactly && !props.loading && (
          <button
            type="button"
            className="pager-count"
            title="Count all rows exactly, without time limit (can take long on big tables)"
            onClick={() => {
              setCounting(true);
              props.onCountExactly!();
            }}
          >
            Count
          </button>
        )}
        {props.loading && (
          <div className="pager-loading">
            &nbsp; Loading…
            {props.onCancel && <button type="button" className="pager-cancel" title="Stop query (KILL QUERY)" onClick={props.onCancel}>Cancel</button>}
          </div>
        )}
      </div>
      {props.children && (
        <div className="cmp-records-view-pager-item pager-extra">
          {props.children}
        </div>
      )}
    </div>
  );
});
