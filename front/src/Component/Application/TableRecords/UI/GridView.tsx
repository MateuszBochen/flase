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

type PendingSubmitType = {
  editable: EditableResultInterface;
  changes: RowChangeInterface[];
};

type SqlPreviewType = {
  statements: string[];
};

/** GridView */
export default (props: GridViewPropsInterface) => {
  const recordsRef = useRef<RecordsViewRefInterface|null>(null);

  const columnsRef = useRef<string>('*');

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
        onPageChange={onPageChangeHandler}
        onSort={onSortHandler}
        queryLoading={false}
        cellRender={undefined}
        onPreviewChanges={onPreviewChanges}
        onSubmitChanges={onSubmitChanges}
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
