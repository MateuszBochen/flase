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
import {CellValueType, QuickFilterOperatorType} from '../../../Table/Interface/RecordsViewPropsInterface';
import FilterWasRequested from '../Event/FilterWasRequested';
import DriverFactory from '../../../../Library/Database/Driver/DriverFactory';
import openTableTab from '../openTableTab';
import {CopyFormatType, EXPORT_FILE, formatCopy} from '../../../Table/Copy/CopyFormats';
import downloadText from '../../../../Library/File/downloadText';
import ConsoleApi from '../../../../Library/Console/ConsoleApi';
import {SingleRowType} from '../../../Table/Interface/RecordsViewPropsInterface';
import useConnectionSettings from '../../../../Library/Connection/useConnectionSettings';

type PendingSubmitType = {
  editable: EditableResultInterface;
  changes: RowChangeInterface[];
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
  /** next reload is refresh after save - keep scroll position */
  const keepScrollOnReload = useRef<boolean>(false);

  /** handle query change */
  useEffect(() => {
    const eventId = EventBus.subscribe<QueryRequestDataInterface>(QueryWasChanged.name, (event) => {
      const eventData = event.getData();
      if (eventData.tabId === props.tabId) {
        const queryModel = event.getData().query;
        const limit = queryModel.getRecordsLimits();

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

  const sendRowChanges = useCallback((editable: EditableResultInterface, changes: RowChangeInterface[], dryRun: boolean) => {
    setSubmitting(true);
    pendingSubmit.current = {editable, changes};
    RecordManager.getInstance().applyRowChanges(props.connection, {
      tabId: props.tabId,
      database: props.database,
      table: editable.table,
      changes,
      dryRun,
    });
  }, [props.connection, props.database, props.tabId]);

  const onPreviewChanges = useCallback((editable: EditableResultInterface, changes: RowChangeInterface[]) => {
    sendRowChanges(editable, changes, true);
  }, [sendRowChanges]);

  /** with confirmation required, sql is shown first and executed after confirm */
  const onSubmitChanges = useCallback((editable: EditableResultInterface, changes: RowChangeInterface[]) => {
    sendRowChanges(editable, changes, !!props.connection.changeConfirmationRequired);
  }, [sendRowChanges, props.connection]);

  const executePreviewedChanges = useCallback(() => {
    if (pendingSubmit.current) {
      sendRowChanges(pendingSubmit.current.editable, pendingSubmit.current.changes, false);
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
    const condition = operator === 'IS NULL' || operator === 'IS NOT NULL'
      ? `${identifier} ${operator}`
      : `${identifier} ${operator} ${sql.value(value)}`;
    EventBus.emit(new FilterWasRequested({tabId: props.tabId, condition}));
  }, [props.tabId, props.connection]);

  /**
   * all rows of current query as file - the query is run again without LIMIT,
   * rows are collected by own tabId so the grid is not touched
   */
  const onExportAll = useCallback((format: CopyFormatType, fileName: string) => {
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
          const file = EXPORT_FILE[format];
          downloadText(`${fileName}.${file.extension}`, formatCopy(format, columns, rows, table, DriverFactory.getDriver(props.connection).sql), file.mimeType);
          toast.success(`Exported ${rows.length.toLocaleString()} row(s)`, {id: toastId});
          break;
        }
        case MessageType.QUERY_ERROR:
          EventBus.unSub(eventId);
          toast.error(`Export failed: ${message.payload.error}`, {id: toastId});
          break;
      }
    });

    RecordManager.getInstance().sendQuery(props.connection, {
      query: currentQuery.withoutLimit(),
      database: props.database,
      tabId: exportTabId,
    });
  }, [props.connection, props.database, props.tabId, props.queryRef]);

  /** foreign key value - open referenced row */
  const onOpenReference = useCallback((column: ColumnInterface, value: CellValueType, newTab: boolean) => {
    const reference = column.reference;
    if (!reference) return;
    const query = DriverFactory.getDriver(props.connection).getRowsQuery(
      reference.table,
      reference.table.databaseName,
      [{column: reference.columnName, value}],
    );
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
  const onSortHandler = useCallback((column: ColumnInterface, direction: DirectionOrder) => {
    const event = new OrderDirectionWasChanged({
      column: column,
      direction: direction,
      tabId: props.tabId,
    });
    EventBus.emit<SortDirectionDataInterface>(event);
  }, [props.tabId]);

  return (
    <div className="cmp-table-data-content">
      <RecordsView
        ref={recordsRef}
        sqlLiteral={DriverFactory.getDriver(props.connection).sql}
        onPageChange={onPageChangeHandler}
        onSort={onSortHandler}
        queryLoading={false}
        cellRender={undefined}
        onPreviewChanges={onPreviewChanges}
        onSubmitChanges={connection.readOnly ? undefined : onSubmitChanges}
        onOpenReference={onOpenReference}
        onQuickFilter={onQuickFilter}
        onExportAll={onExportAll}
        onCancelQuery={() => ConsoleApi.getInstance().cancel(props.connection, props.tabId)}
        exportName={props.table.tableName}
        submitting={submitting}
      />
      {sqlPreview && (
        <Popup
          isOpen={true}
          label={props.connection.changeConfirmationRequired ? 'Confirm changes' : 'SQL preview'}
          onClickOk={() => setSqlPreview(null)}
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
