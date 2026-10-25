import {OrderItemType} from '../../../../Library/Database/Interface/QueryInterface';
import exportRows, {ExportFormatType} from '../../../../Library/Export/ExportRows';
import RecordsView from '../../../Table/RecordsView';
import GridViewPropsInterface from '../Interface/GridViewPropsInterface';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import EventBus from '../../../../Library/EventBus/EventBus';
import WebsocketReceivedAMessage from '../../../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../../../Library/WebSocket/Interface/MessageInterface';
import TotalCountInterface from '../../../../Library/Record/Interface/TotalCountInterface';
import MessageType from '../../../../Library/WebSocket/Enum/MessageType';
import SingleSelectColumnInterface from '../../../../Library/Record/Interface/SingleSelectColumnInterface';
import SingleSelectRecordInterface from '../../../../Library/Record/Interface/SingleSelectRecordInterface';
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
import {SingleRowType} from '../../../Table/Interface/RecordsViewPropsInterface';
import useConnectionSettings from '../../../../Library/Connection/useConnectionSettings';

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

  /** handle query change */
  useEffect(() => {
    const eventId = EventBus.subscribe<QueryRequestDataInterface>(QueryWasChanged.name, (event) => {
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

  /** handle total count */
  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<TotalCountInterface>>(WebsocketReceivedAMessage.name, (event) => {
      const eventData = event.getData();
      if (eventData.payload.tabId === props.tabId && eventData.message === MessageType.SELECT_TOTAL_COUNT) {
        recordsRef.current!.setTotal(eventData.payload.totalCount);
      }
    });

    return () => {
      EventBus.unSub(eventId);
    };

  }, [props.tabId]);

  /** handle columns change */
  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<SingleSelectColumnInterface>>(WebsocketReceivedAMessage.name, (event) => {
      const eventData = event.getData();

      if (eventData.payload.tabId === props.tabId && eventData.message === MessageType.SINGLE_SELECT_COLUMN) {
        recordsRef.current!.setColumns(eventData.payload.columns, eventData.payload.editable, eventData.payload.readOnlyReason);
      }
    });

    return () => {
      EventBus.unSub(eventId);
    }
  }, []);

  /** handle new record */
  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<SingleSelectRecordInterface>>(WebsocketReceivedAMessage.name, (event) => {
      const eventData = event.getData();
      if (eventData.payload.tabId === props.tabId && eventData.message === MessageType.SINGLE_SELECT_RECORD) {
        recordsRef.current!.addRow(eventData.payload.rowDataValue);
      }
    });

    return () => {
      EventBus.unSub(eventId);
    }

  }, [recordsRef]);

  /** handle end of query - all records were received */
  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<QueryFinishedInterface>>(WebsocketReceivedAMessage.name, (event) => {
      const eventData = event.getData();
      if (eventData.payload?.tabId === props.tabId && eventData.message === MessageType.QUERY_FINISHED) {
        recordsRef.current!.setFinished(eventData.payload.rows);
      }
    });

    return () => {
      EventBus.unSub(eventId);
    }
  }, [props.tabId]);

  /** handle query error */
  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<QueryErrorInterface>>(WebsocketReceivedAMessage.name, (event) => {
      const eventData = event.getData();
      if (eventData.payload?.tabId === props.tabId && eventData.message === MessageType.QUERY_ERROR) {
        if (eventData.payload.command === CommandType.APPLY_ROW_CHANGES) {
          // keep grid and pending changes, error itself is shown as toast
          setSubmitting(false);
          return;
        }
        recordsRef.current!.setError(eventData.payload.error);
      }
    });

    return () => {
      EventBus.unSub(eventId);
    }
  }, [props.tabId]);

  /** handle answers for row changes */
  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<RowChangesResultInterface>>(WebsocketReceivedAMessage.name, (event) => {
      const eventData = event.getData();
      if (eventData.payload?.tabId !== props.tabId) {
        return;
      }

      if (eventData.message === MessageType.ROW_CHANGES_PREVIEW) {
        setSubmitting(false);
        setSqlPreview({statements: eventData.payload.statements});
      }

      if (eventData.message === MessageType.ROW_CHANGES_APPLIED) {
        setSubmitting(false);
        setSqlPreview(null);
        pendingSubmit.current = null;
        toast.success(`Saved, ${eventData.payload.affectedRows} row(s) affected`);

        // updated / deleted rows are changed in place, grid stays where it is
        if (recordsRef.current!.commitChanges()) {
          keepScrollOnReload.current = true;
          EventBus.emit<string>(new QueryRefreshWasRequested(props.tabId));
        }
      }
    });

    return () => {
      EventBus.unSub(eventId);
    }
  }, [props.tabId]);

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
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.payload?.tabId !== exportTabId) {
        return;
      }
      switch (message.message) {
        case MessageType.SINGLE_SELECT_COLUMN:
          columns = message.payload.columns;
          table = message.payload.editable?.table.name;
          break;
        case MessageType.SINGLE_SELECT_RECORD:
          rows.push(message.payload.rowDataValue);
          if (rows.length % 5000 === 0) {
            toast.loading(`Exporting… ${rows.length.toLocaleString()} rows`, {id: toastId});
          }
          break;
        case MessageType.QUERY_FINISHED: {
          EventBus.unSub(eventId);
          if (exportRows(format, columns, rows, fileName, table, DriverFactory.getDriver(props.connection).sql, printWindow)) {
            toast.success(format === 'pdf' ? 'Print dialog opened - choose "Save as PDF"' : `Exported ${rows.length.toLocaleString()} row(s)`, {id: toastId});
          } else {
            toast.error('Window for printing was blocked by browser', {id: toastId});
          }
          break;
        }
        case MessageType.QUERY_ERROR:
          EventBus.unSub(eventId);
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
    });
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
