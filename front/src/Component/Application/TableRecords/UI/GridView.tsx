import RecordsView from '../../../Table/RecordsView';
import GridViewPropsInterface from '../Interface/GridViewPropsInterface';
import {useEffect, useRef, useState} from 'react';
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

/** GridView */
export default (props: GridViewPropsInterface) => {
  const recordsRef = useRef<RecordsViewRefInterface|null>(null);

  const columnsRef = useRef<string>('*');

  /** handle query change */
  useEffect(() => {
    const eventId = EventBus.subscribe<QueryRequestDataInterface>(QueryWasChanged.name, (event) => {
      const eventData = event.getData();
      if (eventData.tabId === props.tabId) {
        console.log(event.getData().query.getOnlyColumnsAsString());

        if (columnsRef.current === event.getData().query.getOnlyColumnsAsString()) {
          console.log('Tylko dane');
          recordsRef.current!.reset('records');
        } else {
          console.log('cala tabela');
          columnsRef.current = event.getData().query.getOnlyColumnsAsString();
          recordsRef.current!.reset();
        }




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
        // setTotalRecords(eventData.payload.totalCount);
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

  console.log('Grid View');
  return (
    <div className="cmp-table-data-content">
      <RecordsView
        ref={recordsRef}
        loadedRecords={0}
        possibleRecords={0}
        total={0}
        page={0}
        perPage={0}
        onPageChange={() => {}}
        onSort={() => {}}
        queryLoading={false}
        cellRender={undefined}
      />
    </div>
  );
}
