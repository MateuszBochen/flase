import RecordsView from '../../../Table/RecordsView';
import GridViewPropsInterface from '../Interface/GridViewPropsInterface';
import {useCallback, useEffect, useRef, useState} from 'react';
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

/** GridView */
export default (props: GridViewPropsInterface) => {
  const recordsRef = useRef<RecordsViewRefInterface|null>(null);

  const columnsRef = useRef<string>('*');

  /** handle query change */
  useEffect(() => {
    const eventId = EventBus.subscribe<QueryRequestDataInterface>(QueryWasChanged.name, (event) => {
      const eventData = event.getData();
      if (eventData.tabId === props.tabId) {
        const queryModel = event.getData().query;
        const limit = queryModel.getRecordsLimits();

        console.log(queryModel.getOnlyColumnsAsString());

        if (columnsRef.current === queryModel.getOnlyColumnsAsString()) {
          console.log('Tylko dane');
          recordsRef.current!.reset('records');
        } else {
          console.log('cala tabela');
          columnsRef.current = queryModel.getOnlyColumnsAsString();
          recordsRef.current!.reset();
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
        recordsRef.current!.setColumns(eventData.payload.columns);
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

  console.log('Grid View');
  return (
    <div className="cmp-table-data-content">
      <RecordsView
        ref={recordsRef}
        onPageChange={onPageChangeHandler}
        onSort={onSortHandler}
        queryLoading={false}
        cellRender={undefined}
      />
    </div>
  );
}
