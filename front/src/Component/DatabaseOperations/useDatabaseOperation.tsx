import React, {useCallback, useEffect, useRef, useState} from 'react';
import toast from 'react-hot-toast';
import EventBus from '../../Library/EventBus/EventBus';
import WebsocketReceivedAMessage from '../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../Library/WebSocket/Interface/MessageInterface';
import MessageType from '../../Library/WebSocket/Enum/MessageType';
import ConnectionDataInterface from '../../Library/Connection/Interface/ConnectionDataInterface';
import DatabaseOperations from '../../Library/Database/DatabaseOperations';
import {
  DatabaseOperationResultInterface,
  DatabaseOperationType,
  MaintenanceResultInterface,
} from '../../Library/Database/Interface/DatabaseOperationInterface';
import OperationConfirmPopup from './OperationConfirmPopup';
import MaintenanceResultsPopup from './MaintenanceResultsPopup';

type PreviewType = {statements: string[], operation: DatabaseOperationType} | null;

/** texts of success toast */
const appliedMessage = (operation: DatabaseOperationType): string => {
  switch (operation.kind) {
    case 'createDatabase': return `${operation.name} was created`;
    case 'alterDatabase': return `Collation of ${operation.name} was changed`;
    case 'renameDatabase': return `${operation.name} was renamed to ${operation.newName}`;
    case 'dropDatabase': return `${operation.name} was dropped`;
    case 'createTable': return `Table ${operation.name} was created`;
    case 'tables': return `${operation.tables.length} table(s) ${operation.action === 'drop' ? 'dropped' : 'truncated'}`;
    case 'createView': return `View ${operation.name} was created`;
    case 'dropObject': return `${operation.object.name} was dropped`;
    case 'objectDdl': return operation.replace ? `${operation.replace.name} was changed` : 'Object was created';
    default: return 'Done';
  }
};

/**
 * preview -> confirm -> execute of database operation. Every change is previewed first (dryRun),
 * maintenance (OPTIMIZE, VACUUM...) runs at once and its messages are shown.
 * Render returned element - it contains the popups.
 */
const useDatabaseOperation = (
  connection: ConnectionDataInterface,
  tabId: string,
  onApplied?: (operation: DatabaseOperationType, result: DatabaseOperationResultInterface) => void,
) => {
  const [busy, setBusy] = useState<boolean>(false);
  const [preview, setPreview] = useState<PreviewType>(null);
  const [results, setResults] = useState<{operation: DatabaseOperationType, results: MaintenanceResultInterface[]} | null>(null);
  /** operation waiting for answer */
  const pending = useRef<DatabaseOperationType | null>(null);
  const onAppliedRef = useRef(onApplied);
  onAppliedRef.current = onApplied;

  const send = useCallback((operation: DatabaseOperationType, dryRun: boolean) => {
    pending.current = operation;
    setBusy(true);
    DatabaseOperations.operation(connection, {tabId, operation, dryRun});
  }, [connection, tabId]);

  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      if (message.payload?.tabId !== tabId) {
        return;
      }
      switch (message.message) {
        case MessageType.DATABASE_OPERATION_PREVIEW:
          setBusy(false);
          setPreview({statements: (message.payload as DatabaseOperationResultInterface).statements, operation: pending.current!});
          break;
        case MessageType.DATABASE_OPERATION_APPLIED: {
          setBusy(false);
          setPreview(null);
          const operation = pending.current;
          pending.current = null;
          const result = message.payload as DatabaseOperationResultInterface;
          if (operation?.kind === 'maintenance') {
            setResults({operation, results: result.results || []});
          } else if (operation) {
            toast.success(appliedMessage(operation));
          }
          if (operation) {
            onAppliedRef.current?.(operation, result);
          }
          break;
        }
        case MessageType.QUERY_ERROR:
          // error itself is shown as toast, preview stays open
          setBusy(false);
          pending.current = null;
          break;
      }
    });
    return () => EventBus.unSub(eventId);
  }, [tabId]);

  /** maintenance is executed at once, other operations show sql first */
  const run = useCallback((operation: DatabaseOperationType) => {
    send(operation, operation.kind !== 'maintenance');
  }, [send]);

  const element = (
    <>
      {preview && (
        <OperationConfirmPopup
          connection={connection}
          statements={preview.statements}
          operation={preview.operation}
          busy={busy}
          onChange={(operation) => send(operation, true)}
          onExecute={() => send(preview.operation, false)}
          onCancel={() => setPreview(null)}
        />
      )}
      {results && <MaintenanceResultsPopup operation={results.operation} results={results.results} onClose={() => setResults(null)} />}
    </>
  );

  return {run, busy, element, previewOpen: !!preview};
};

export default useDatabaseOperation;
