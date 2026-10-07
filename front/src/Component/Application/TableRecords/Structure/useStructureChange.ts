import {useCallback, useEffect, useRef, useState} from 'react';
import toast from 'react-hot-toast';
import EventBus from '../../../../Library/EventBus/EventBus';
import WebsocketReceivedAMessage from '../../../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../../../Library/WebSocket/Interface/MessageInterface';
import MessageType from '../../../../Library/WebSocket/Enum/MessageType';
import TableManager from '../../../../Library/Table/TableManager';
import ConnectionDataInterface from '../../../../Library/Connection/Interface/ConnectionDataInterface';
import TableInterface from '../../../../Library/Table/Interface/TableInterface';
import {StructureChangeType} from '../../../../Library/Table/Interface/StructureChangeInterface';
import StructureChangeResultInterface from '../../../../Library/Table/Interface/StructureChangeResultInterface';

export type StructurePreviewType = {statements: string[], change: StructureChangeType} | null;

/**
 * preview -> execute flow of structure change. Every change is previewed first (dryRun),
 * executed only after confirmation. Answers are matched by own tabId.
 */
const useStructureChange = (
  connection: ConnectionDataInterface,
  table: TableInterface,
  tabId: string,
  onApplied: (change: StructureChangeType) => void,
) => {
  const [busy, setBusy] = useState<boolean>(false);
  const [preview, setPreview] = useState<StructurePreviewType>(null);
  /** change waiting for answer */
  const pendingChange = useRef<StructureChangeType | null>(null);
  const onAppliedRef = useRef(onApplied);
  onAppliedRef.current = onApplied;

  const send = useCallback((change: StructureChangeType, dryRun: boolean) => {
    pendingChange.current = change;
    setBusy(true);
    TableManager.getInstance().changeStructure(connection, {tabId, table, change, dryRun});
  }, [connection, table, tabId]);

  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.payload?.tabId !== tabId) {
        return;
      }
      switch (message.message) {
        case MessageType.STRUCTURE_CHANGE_PREVIEW:
          setBusy(false);
          setPreview({statements: (message.payload as StructureChangeResultInterface).statements, change: pendingChange.current!});
          break;
        case MessageType.STRUCTURE_CHANGE_APPLIED: {
          setBusy(false);
          setPreview(null);
          toast.success('Structure was changed');
          const change = pendingChange.current;
          pendingChange.current = null;
          if (change) {
            onAppliedRef.current(change);
          }
          break;
        }
        case MessageType.QUERY_ERROR:
          // error itself is shown as toast, form / preview stay open
          setBusy(false);
          pendingChange.current = null;
          break;
      }
    });
    return () => EventBus.unSub(eventId);
  }, [tabId]);

  return {
    busy,
    preview,
    /** show sql of change */
    requestPreview: (change: StructureChangeType) => send(change, true),
    /** execute previewed change */
    execute: () => preview && send(preview.change, false),
    closePreview: () => setPreview(null),
  };
};

export default useStructureChange;
