import RecordsView from '../../../Table/RecordsView';
import GridViewPropsInterface from '../Interface/GridViewPropsInterface';
import {useEffect, useRef, useState} from 'react';
import EventBus from '../../../../Library/EventBus/EventBus';
import WebsocketReceivedAMessage from '../../../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../../../Library/WebSocket/Interface/MessageInterface';
import TotalCountInterface from '../../../../Library/Record/Interface/TotalCountInterface';
import MessageType from '../../../../Library/WebSocket/Enum/MessageType';
import SingleSelectColumnInterface from '../../../../Library/Record/Interface/SingleSelectColumnInterface';
import {SingleRowType} from '../../../Table/Interface/RecordsViewPropsInterface';
import SingleSelectRecordInterface from '../../../../Library/Record/Interface/SingleSelectRecordInterface';
import QueryWasChanged from '../Event/QueryWasChanged';
import QueryRequestDataInterface from '../../../../Library/Record/Interface/QueryRequestDataInterface';
import RecordsViewRefInterface from '../../../Table/Interface/RecordsViewRefInterface';

/** GridView */
export default (props: GridViewPropsInterface) => {
  const [totalRecords, setTotalRecords] = useState<number>(0);
  const [rows, setRows] = useState<SingleRowType[]>([]);

  const recordsRef = useRef<RecordsViewRefInterface|null>(null);

  /** handle query change */
  useEffect(() => {
    const eventId = EventBus.subscribe<QueryRequestDataInterface>(QueryWasChanged.name, (event) => {
      const eventData = event.getData();
      if (eventData.tabId === props.tabId) {
        setTotalRecords(0);
        setRows([]);
      }
    });

    return () => {
      EventBus.unSub(eventId);
    };

  }, [totalRecords, rows]);

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

  }, [rows]);

  console.log('Grid View');
  return (
    <div className="cmp-table-data-content">
      <RecordsView
        ref={recordsRef}
        loadedRecords={0}
        possibleRecords={0}
        total={totalRecords}
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
