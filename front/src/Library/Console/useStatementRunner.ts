import {useCallback, useEffect, useRef, useState} from 'react';
import EventBus from '../EventBus/EventBus';
import WebsocketReceivedAMessage from '../WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../WebSocket/Interface/MessageInterface';
import MessageType from '../WebSocket/Enum/MessageType';
import ConnectionDataInterface from '../Connection/Interface/ConnectionDataInterface';
import ConsoleApi from './ConsoleApi';
import ResultBuffer from './ResultBuffer';
import {ExecutionFinishedInterface, StatementFinishedInterface, StatementResultType} from './StatementInterface';

export type StatementLogType = {
  index: number;
  sql: string;
  status: 'waiting' | 'running' | 'done' | 'error' | 'skipped';
  durationMs?: number;
  result?: StatementResultType;
  error?: string;
};

/**
 * Runs statements on server (one session) and collects results.
 * Every run has own tabId - answers of previous run are ignored, cancel stops the current one.
 */
const useStatementRunner = (
  connection: ConnectionDataInterface,
  baseTabId: string,
  onStatementFinished?: (statement: StatementFinishedInterface, database: string | null) => void,
) => {
  const [running, setRunning] = useState<boolean>(false);
  const [logs, setLogs] = useState<StatementLogType[]>([]);
  /** index of statements which returned rows */
  const [resultIndexes, setResultIndexes] = useState<number[]>([]);
  const buffers = useRef<Map<number, ResultBuffer>>(new Map());
  const runTabId = useRef<string>('');
  const runCounter = useRef<number>(0);
  const runDatabase = useRef<string | null>(null);
  const onFinishedRef = useRef(onStatementFinished);
  onFinishedRef.current = onStatementFinished;

  const bufferOf = (index: number): ResultBuffer => {
    if (!buffers.current.has(index)) {
      buffers.current.set(index, new ResultBuffer());
    }
    return buffers.current.get(index)!;
  };

  const updateLog = (index: number, change: Partial<StatementLogType>) => {
    setLogs((previous) => previous.map((log) => log.index === index ? {...log, ...change} : log));
  };

  useEffect(() => {
    const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
      const message = event.getData();
      const tabId: string | undefined = message.payload?.tabId;
      if (!tabId || !runTabId.current || !(tabId === runTabId.current || tabId.startsWith(`${runTabId.current}:`))) {
        return;
      }

      // rows of statement N have tabId `${runTabId}:${N}`
      if (tabId !== runTabId.current) {
        const index = Number(tabId.substring(runTabId.current.length + 1));
        if (message.message === MessageType.SINGLE_SELECT_COLUMN) {
          bufferOf(index).push({type: 'columns', columns: message.payload.columns, readOnlyReason: message.payload.readOnlyReason});
          setResultIndexes((previous) => previous.includes(index) ? previous : [...previous, index]);
        } else if (message.message === MessageType.SINGLE_SELECT_RECORD) {
          bufferOf(index).push({type: 'row', row: message.payload.rowDataValue});
        } else if (message.message === MessageType.QUERY_FINISHED) {
          bufferOf(index).push({type: 'finished', rows: message.payload.rows});
        }
        return;
      }

      switch (message.message) {
        case MessageType.STATEMENT_STARTED:
          updateLog(message.payload.index, {status: 'running'});
          break;
        case MessageType.STATEMENT_FINISHED: {
          const finished = message.payload as StatementFinishedInterface;
          updateLog(finished.index, {
            status: finished.error ? 'error' : 'done',
            durationMs: finished.durationMs,
            result: finished.result,
            error: finished.error,
          });
          onFinishedRef.current?.(finished, runDatabase.current);
          if (!finished.error && /^\s*use\s+`?([^`;\s]+)`?/i.test(finished.sql)) {
            runDatabase.current = /^\s*use\s+`?([^`;\s]+)`?/i.exec(finished.sql)![1];
          }
          break;
        }
        case MessageType.EXECUTION_FINISHED: {
          const summary = message.payload as ExecutionFinishedInterface;
          setRunning(false);
          if (summary.skipped) {
            setLogs((previous) => previous.map((log) => log.status === 'waiting' ? {...log, status: 'skipped'} : log));
          }
          break;
        }
        case MessageType.QUERY_ERROR:
          // whole run failed (no connection, unknown database, connection lost)
          setRunning(false);
          setLogs((previous) => {
            const firstOpen = previous.find((log) => log.status === 'running' || log.status === 'waiting');
            return previous.map((log) => {
              if (log === firstOpen) return {...log, status: 'error', error: message.payload.error};
              return log.status === 'waiting' || log.status === 'running' ? {...log, status: 'skipped'} : log;
            });
          });
          break;
      }
    });
    return () => EventBus.unSub(eventId);
  }, []);

  const run = useCallback((statements: string[], database: string | null, maxRows: number = 1000) => {
    if (!statements.length) return;
    runTabId.current = `${baseTabId}:run:${++runCounter.current}`;
    runDatabase.current = database;
    buffers.current = new Map();
    setResultIndexes([]);
    setLogs(statements.map((sql, index) => ({index, sql, status: 'waiting'})));
    setRunning(true);
    ConsoleApi.getInstance().execute(connection, {tabId: runTabId.current, database, statements, maxRows});
  }, [connection, baseTabId]);

  const cancel = useCallback(() => {
    if (runTabId.current) {
      ConsoleApi.getInstance().cancel(connection, runTabId.current);
    }
  }, [connection]);

  return {running, logs, resultIndexes, buffer: (index: number) => bufferOf(index), run, cancel};
};

export default useStatementRunner;
