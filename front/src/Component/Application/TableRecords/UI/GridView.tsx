import {OrderItemType} from '../../../../Library/Database/Interface/QueryInterface';
import exportRows, {ExportFormatType} from '../../../../Library/Export/ExportRows';
import RecordsView from '../../../Table/RecordsView';
import GridViewPropsInterface from '../Interface/GridViewPropsInterface';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import EventBus from '../../../../Library/EventBus/EventBus';
import MessageInterface from '../../../../Library/WebSocket/Interface/MessageInterface';
import TotalCountInterface from '../../../../Library/Record/Interface/TotalCountInterface';
import MessageType from '../../../../Library/WebSocket/Enum/MessageType';
import SingleSelectColumnInterface from '../../../../Library/Record/Interface/SingleSelectColumnInterface';
import SelectRecordsInterface from '../../../../Library/Record/Interface/SelectRecordsInterface';
import QueryWasChanged from '../Event/QueryWasChanged';
import QueryRequestDataInterface from '../../../../Library/Record/Interface/QueryRequestDataInterface';
import RecordsViewRefInterface from '../../../Table/Interface/RecordsViewRefInterface';
import PageWasChanged from '../Event/PageWasChanged';
import PaginationDataInterface from '../Interface/PaginationDataInterface';
import ColumnInterface from '../../../../Library/Table/Interface/ColumnInterface';
import {DirectionOrder} from '../../../Table/Enum/DirectionOrder';
import OrderDirectionWasChanged from '../Event/OrderDirectionWasChanged';
import SortDirectionDataInterface from '../Interface/SortDirectionDataInterface';
import QueryFinishedInterface from '../../../../Library/Record/Interface/QueryFinishedInterface';
import QueryErrorInterface from '../../../../Library/Record/Interface/QueryErrorInterface';
import EditableResultInterface from '../../../../Library/Record/Interface/EditableResultInterface';
import RowChangeInterface from '../../../../Library/Record/Interface/RowChangeInterface';
import RecordManager from '../../../../Library/Record/RecordManager';
import RowChangesResultInterface from '../../../../Library/Record/Interface/RowChangesResultInterface';
import CommandType from '../../../../Library/WebSocket/Enum/CommandType';
import QueryRefreshWasRequested from '../Event/QueryRefreshWasRequested';
import Popup from '../../../../UI/Popup/Popup';
import Button from '../../../../UI/Button/Button';
import toast from 'react-hot-toast';
import {CellValueType, QuickFilterOperatorType, RowChangesOptionsType} from '../../../Table/Interface/RecordsViewPropsInterface';
import FilterWasRequested from '../Event/FilterWasRequested';
import DriverFactory from '../../../../Library/Database/Driver/DriverFactory';
import openTableTab from '../openTableTab';
import ConsoleApi from '../../../../Library/Console/ConsoleApi';
import TabMessages from '../../../../Library/WebSocket/TabMessages';
import {SingleRowType} from '../../../Table/Interface/RecordsViewPropsInterface';
import useConnectionSettings from '../../../../Library/Connection/useConnectionSettings';
import useReloadAfterLogin from '../../../../Library/Connection/useReloadAfterLogin';

type PendingSubmitType = {
  editable: EditableResultInterface;
  changes: RowChangeInterface[];
  options: RowChangesOptionsType;
};

type SqlPreviewType = {
  statements: string[];
};

/** GridView */
export default (props: GridViewPropsInterface) => {
  const connection = useConnectionSettings(props.connection);
  const recordsRef = useRef<RecordsViewRefInterface|null>(null);

  const columnsRef = useRef<string>('*');
  const exportCounter = useRef<number>(0);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [sqlPreview, setSqlPreview] = useState<SqlPreviewType | null>(null);
  /** changes waiting for preview answer / confirmation */
  const pendingSubmit = useRef<PendingSubmitType | null>(null);
  /** ORDER BY of current query - shown in headers */
  const [sortOrder, setSortOrder] = useState<OrderItemType[]>([]);
  /** next reload is refresh after save - keep scroll position */
  const keepScrollOnReload = useRef<boolean>(false);

  // first query was sent by query place before this view listened (restored tab)
  useEffect(() => {
    if (props.queryRef?.current) setSortOrder(props.queryRef.current.getOrder());
  }, []);

  /**
   * tab shows other table / was closed - query (or count) still running for this tab is stopped.
   * Cancel is checked a tick later: react strict mode unmounts and mounts again at once,
   * the first query must not be killed then. Server ignores cancel when nothing runs.
   */
  const mounted = useRef<boolean>(false);
  useEffect(() => {
    mounted.current = true;
    const connectionData = props.connection;
    const tabId = props.tabId;
    return () => {
      mounted.current = false;
      setTimeout(() => {
        if (!mounted.current) ConsoleApi.getInstance().cancel(connectionData, tabId);
      }, 0);
    };
  }, [props.connection, props.tabId]);

  /** handle query change */
  useEffect(() => {
    const eventId = EventBus.subscribe<QueryRequestDataInterface>(QueryWasChanged, (event) => {
      const eventData = event.getData();
      if (eventData.tabId === props.tabId) {
        const queryModel = event.getData().query;
        const limit = queryModel.getRecordsLimits();
        setSortOrder(queryModel.getOrder());

        const keepScroll = keepScrollOnReload.current;
        keepScrollOnReload.current = false;

        if (columnsRef.current === queryModel.getOnlyColumnsAsString()) {
          recordsRef.current!.reset('records', keepScroll);
        } else {
          columnsRef.current = queryModel.getOnlyColumnsAsString();
          recordsRef.current!.reset(undefined, keepScroll);
        }

        recordsRef.current!.setLimit(limit.offset, limit.limit);


      }
    });

    return () => {
      EventBus.unSub(eventId);
    };

  }, [recordsRef]);

  /** not logged in (server restarted) - query runs again after login */
  const reloadAfterLogin = useReloadAfterLogin(props.connection, () => EventBus.emit<string>(new QueryRefreshWasRequested(props.tabId)));

  /**
   * messages of the tab: columns -> rows -> finished -> total count (or error at any point),
   * answers of row changes
   */
  useEffect(() => TabMessages.subscribe<any>(props.tabId, (message) => {
    const records = recordsRef.current;
    if (!records) return;
    switch (message.message) {
      case MessageType.SINGLE_SELECT_COLUMN: {
        const payload = message.payload as SingleSelectColumnInterface;
        records.setColumns(payload.columns, payload.editable, payload.readOnlyReason);
        break;
      }
      case MessageType.SELECT_RECORDS:
        records.appendRows((message.payload as SelectRecordsInterface).rows);
        break;
      case MessageType.QUERY_FINISHED:
        records.setFinished((message.payload as QueryFinishedInterface).rows);
        break;
      case MessageType.SELECT_TOTAL_COUNT: {
        const {totalCount, ...count} = message.payload as TotalCountInterface;
        if (count.error) toast.error(`Rows were not counted: ${count.error}`);
        records.setTotal(totalCount, count);
        break;
      }
      case MessageType.QUERY_ERROR: {
        const payload = message.payload as QueryErrorInterface;
        if (payload.command === CommandType.APPLY_ROW_CHANGES) {
          // keep grid and pending changes, error itself is shown as toast
          setSubmitting(false);
          return;
        }
        if (payload.disconnected) reloadAfterLogin();
        records.setError(payload.error);
        break;
      }
      case MessageType.ROW_CHANGES_PREVIEW:
        setSubmitting(false);
        setSqlPreview({statements: (message.payload as RowChangesResultInterface).statements});
        break;
      case MessageType.ROW_CHANGES_APPLIED:
        setSubmitting(false);
        setSqlPreview(null);
        pendingSubmit.current = null;
        toast.success(`Saved, ${(message.payload as RowChangesResultInterface).affectedRows} row(s) affected`);
        // updated / deleted rows are changed in place, grid stays where it is
        if (records.commitChanges()) {
          keepScrollOnReload.current = true;
          EventBus.emit<string>(new QueryRefreshWasRequested(props.tabId));
        }
        break;
    }
  }), [props.tabId]);

  const sendRowChanges = useCallback((editable: EditableResultInterface, changes: RowChangeInterface[], options: RowChangesOptionsType, dryRun: boolean) => {
    setSubmitting(true);
    pendingSubmit.current = {editable, changes, options};
    RecordManager.getInstance().applyRowChanges(props.connection, {
      tabId: props.tabId,
      database: props.database,
      table: editable.table,
      changes,
      dryRun,
      ignoreForeignKeys: options.ignoreForeignKeys,
    });
  }, [props.connection, props.database, props.tabId]);

  const onPreviewChanges = useCallback((editable: EditableResultInterface, changes: RowChangeInterface[], options: RowChangesOptionsType) => {
    sendRowChanges(editable, changes, options, true);
  }, [sendRowChanges]);

  /** with confirmation required, sql is shown first and executed after confirm */
  const onSubmitChanges = useCallback((editable: EditableResultInterface, changes: RowChangeInterface[], options: RowChangesOptionsType) => {
    sendRowChanges(editable, changes, options, !!props.connection.changeConfirmationRequired);
  }, [sendRowChanges, props.connection]);

  const executePreviewedChanges = useCallback(() => {
    if (pendingSubmit.current) {
      sendRowChanges(pendingSubmit.current.editable, pendingSubmit.current.changes, pendingSubmit.current.options, false);
    }
  }, [sendRowChanges]);

  /** quick filter from cell - condition is added to WHERE of query */
  const onQuickFilter = useCallback((column: ColumnInterface, value: CellValueType, operator: QuickFilterOperatorType) => {
    if (operator === 'clear') {
      EventBus.emit(new FilterWasRequested({tabId: props.tabId, condition: null}));
      return;
    }
    // expressions have no table column - filter by expression alias is not possible in WHERE
    const name = column.orgName || column.name;
    // name repeated in result (JOIN) must be qualified by table alias
    const sql = DriverFactory.getDriver(props.connection).sql;
    const identifier = column.key !== column.name && column.alias
      ? `${sql.identifier(column.alias)}.${sql.identifier(name)}`
      : sql.identifier(name);
    let condition: string;
    try {
      condition = operator === 'IS NULL' || operator === 'IS NOT NULL'
        ? `${identifier} ${operator}`
        : `${identifier} ${operator} ${sql.value(value)}`;
    } catch (e: any) {
      // long binary value - only its preview is known
      toast.error(e.message);
      return;
    }
    EventBus.emit(new FilterWasRequested({tabId: props.tabId, condition}));
  }, [props.tabId, props.connection]);

  /**
   * all rows of current query as file - the query is run again without LIMIT,
   * rows are collected by own tabId so the grid is not touched
   */
  const onExportAll = useCallback((format: ExportFormatType, fileName: string) => {
    const currentQuery = props.queryRef?.current;
    if (!currentQuery) {
      toast.error('Query is not loaded yet');
      return;
    }
    const exportTabId = `${props.tabId}:export:${++exportCounter.current}`;
    const toastId = `export-${exportTabId}`;
    let columns: ColumnInterface[] = [];
    let table: string | undefined;
    const rows: SingleRowType[] = [];

    toast.loading('Exporting…', {id: toastId});
    // window must be opened by the click - after loading of rows browser would block it
    const printWindow = format === 'pdf' ? window.open('', '_blank') : null;
    printWindow?.document.write('<p style="font-family: sans-serif">Loading rows…</p>');
    const unsubscribe = TabMessages.subscribe<any>(exportTabId, (message) => {
      switch (message.message) {
        case MessageType.SINGLE_SELECT_COLUMN:
          columns = message.payload.columns;
          table = message.payload.editable?.table.name;
          break;
        case MessageType.SELECT_RECORDS: {
          const before = rows.length;
          rows.push(...message.payload.rows);
          if (Math.floor(rows.length / 5000) > Math.floor(before / 5000)) {
            toast.loading(`Exporting… ${rows.length.toLocaleString()} rows`, {id: toastId});
          }
          break;
        }
        case MessageType.QUERY_FINISHED: {
          unsubscribe();
          if (exportRows(format, columns, rows, fileName, table, DriverFactory.getDriver(props.connection).sql, printWindow)) {
            toast.success(format === 'pdf' ? 'Print dialog opened - choose "Save as PDF"' : `Exported ${rows.length.toLocaleString()} row(s)`, {id: toastId});
          } else {
            toast.error('Window for printing was blocked by browser', {id: toastId});
          }
          break;
        }
        case MessageType.QUERY_ERROR:
          unsubscribe();
          toast.error(`Export failed: ${message.payload.error}`, {id: toastId});
          printWindow?.close();
          break;
      }
    });

    RecordManager.getInstance().sendQuery(props.connection, {
      query: currentQuery.withoutLimit(),
      database: props.database,
      tabId: exportTabId,
      fullValues: true,
      count: false,
    });
  }, [props.connection, props.database, props.tabId, props.queryRef]);

  /** rows were only estimated - count them without time limit (Cancel of the grid stops it) */
  const onCountExactly = useCallback(() => {
    const currentQuery = props.queryRef?.current;
    if (!currentQuery) return;
    RecordManager.getInstance().countRecords(props.connection, {query: currentQuery, database: props.database, tabId: props.tabId});
  }, [props.connection, props.database, props.tabId, props.queryRef]);

  /** foreign key value - open referenced row */
  const onOpenReference = useCallback((column: ColumnInterface, value: CellValueType, newTab: boolean) => {
    const reference = column.reference;
    if (!reference) return;
    let query: string;
    try {
      query = DriverFactory.getDriver(props.connection).getRowsQuery(
        reference.table,
        reference.table.databaseName,
        [{column: reference.columnName, value}],
      );
    } catch (e: any) {
      // long binary value - only its preview is known
      toast.error(e.message);
      return;
    }
    openTableTab(props.connection, reference.table, {query, newTab});
  }, [props.connection]);

  /**
   * Handle page change
   */
  const onPageChangeHandler = useCallback((page: number, perPage: number, maxPages: number) => {
    EventBus.emit<PaginationDataInterface>(new PageWasChanged(props.tabId, page, perPage, maxPages));
  }, [props.tabId]);

  /**
   * Handle change order
   */
  const onSortHandler = useCallback((column: ColumnInterface, direction: DirectionOrder, multiple?: boolean) => {
    const event = new OrderDirectionWasChanged({
      column: column,
      direction: direction,
      tabId: props.tabId,
      multiple,
    });
    EventBus.emit<SortDirectionDataInterface>(event);
  }, [props.tabId]);

  return (
    <div className="cmp-table-data-content">
      <RecordsView
        ref={recordsRef}
        timingTabId={props.tabId}
        connection={props.connection}
        sqlLiteral={DriverFactory.getDriver(props.connection).sql}
        onPageChange={onPageChangeHandler}
        onSort={onSortHandler}
        sortOrder={sortOrder}
        queryLoading={false}
        cellRender={undefined}
        onPreviewChanges={onPreviewChanges}
        onSubmitChanges={connection.readOnly ? undefined : onSubmitChanges}
        onOpenReference={onOpenReference}
        onQuickFilter={onQuickFilter}
        onExportAll={onExportAll}
        onCancelQuery={() => ConsoleApi.getInstance().cancel(props.connection, props.tabId)}
        onCountExactly={onCountExactly}
        exportName={props.table.tableName}
        columnWidthsKey={`${props.connection.id}/${props.table.dataBaseName}.${props.table.tableName}`}
        submitting={submitting}
      />
      {sqlPreview && (
        <Popup
          openOnMount
          label={props.connection.changeConfirmationRequired ? 'Confirm changes' : 'SQL preview'}
          onClickOk={() => setSqlPreview(null)}
          onClose={() => setSqlPreview(null)}
          buttons={[
            <Button
              key="execute"
              size="small"
              colorVariant="success"
              label="Execute"
              loading={submitting}
              onClick={executePreviewedChanges}
            />,
            <Button key="close" size="small" label="Close" onClick={() => setSqlPreview(null)} />,
          ]}
        >
          <pre className="cmp-sql-preview">{sqlPreview.statements.map((statement) => `${statement};`).join('\n')}</pre>
        </Popup>
      )}
    </div>
  );
}
