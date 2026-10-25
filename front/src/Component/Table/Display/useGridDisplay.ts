import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import EventBus from '../../../Library/EventBus/EventBus';
import WebsocketReceivedAMessage from '../../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageInterface from '../../../Library/WebSocket/Interface/MessageInterface';
import MessageType from '../../../Library/WebSocket/Enum/MessageType';
import CommandType from '../../../Library/WebSocket/Enum/CommandType';
import ConnectionDataInterface from '../../../Library/Connection/Interface/ConnectionDataInterface';
import ColumnInterface from '../../../Library/Table/Interface/ColumnInterface';
import TableManager from '../../../Library/Table/TableManager';
import TableInformationWasReceived from '../../../Library/Table/Event/TableInformationWasReceived';
import DriverFactory from '../../../Library/Database/Driver/DriverFactory';
import EditableResultInterface from '../../../Library/Record/Interface/EditableResultInterface';
import {sendServerCommand} from '../../../Library/Server/useServerRequest';
import ColumnDisplay, {TRANSFORMS, TransformType} from '../../../Library/CellTools/ColumnDisplay';
import {BinaryValueResultInterface} from '../../../Library/CellTools/CellToolsInterface';
import {isBinaryValue, valueKey} from '../../../Library/Record/BinaryValue';
import {isUuidColumn} from '../../../Library/Record/Uuid';
import {ContextMenuItem} from '../../../UI/ContextMenu/ContextMenu';
import {SingleRowType} from '../Interface/RecordsViewPropsInterface';
import {GridDisplayActionsInterface, GridDisplayInterface} from './GridDisplay';

/** labels are loaded for this many different values of one column */
const MAX_LABEL_VALUES = 500;
let requestCounter = 0;

/** rows of one SELECT sent outside of grid */
const selectRows = (connection: ConnectionDataInterface, query: string, database: string): Promise<any[]> => new Promise((resolve, reject) => {
  const tabId = `grid-display:${++requestCounter}`;
  const rows: any[] = [];
  const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
    const message = event.getData();
    if (message.payload?.tabId !== tabId) return;
    if (message.message === MessageType.SINGLE_SELECT_RECORD) {
      rows.push(message.payload.rowDataValue);
    } else if (message.message === MessageType.QUERY_FINISHED) {
      EventBus.unSub(eventId);
      resolve(rows);
    } else if (message.message === MessageType.QUERY_ERROR) {
      EventBus.unSub(eventId);
      reject(new Error(message.payload.error));
    }
  });
  sendServerCommand(connection, CommandType.SEND_SELECT_QUERY, {tabId, query, database: {name: database}});
});

/** whole binary values already loaded - url of blob by cell */
const binaryCache = new Map<string, Promise<{url: string, mimeType: string | null}>>();

/**
 * transformations of columns, labels of referenced rows (display column of referenced table),
 * loading of whole binary values and menu items of column for grid
 */
const useGridDisplay = (
  connection: ConnectionDataInterface | undefined,
  columns: ColumnInterface[],
  getRecords: () => SingleRowType[],
  /** changes when other rows were loaded */
  loaded: boolean,
  editable: EditableResultInterface | null,
  openImage: (url: string, title: string) => void,
) => {
  const [version, setVersion] = useState<number>(0);
  const [labels, setLabels] = useState<GridDisplayInterface['labels']>({});
  const tableManager = TableManager.getInstance();

  // settings or columns of referenced tables changed
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(() => setVersion((previous) => previous + 1), 200);
    };
    const settingsId = EventBus.subscribe(ColumnDisplay.eventName, bump);
    const tablesId = EventBus.subscribe(TableInformationWasReceived.name, bump);
    return () => {
      clearTimeout(timer);
      EventBus.unSub(settingsId);
      EventBus.unSub(tablesId);
    };
  }, []);

  /** columns of 16 bytes values which look like UUID - after commit, rows of grid are not there during render */
  const [uuidColumns, setUuidColumns] = useState<string[]>([]);
  useEffect(() => {
    const records = loaded ? getRecords() : [];
    const found = records.length ? columns.filter((column) => isUuidColumn(column, records.map((row) => row[column.key]))).map((column) => column.key) : [];
    setUuidColumns((previous) => previous.join() === found.join() ? previous : found);
  }, [columns, loaded]);

  /** chosen by user, otherwise UUID for recognized columns */
  const transforms = useMemo(() => {
    const result: {[key: string]: TransformType} = {};
    columns.forEach((column) => {
      const transform = connection ? ColumnDisplay.transformOf(connection.id, column) : '';
      if (transform) {
        result[column.key] = transform;
      } else if (uuidColumns.includes(column.key)) {
        result[column.key] = 'uuid';
      }
    });
    return result;
  }, [connection, columns, uuidColumns, version]);

  /** column shown for foreign key - chosen by user or guessed from referenced table */
  const displayColumnOf = useCallback((column: ColumnInterface): string => {
    if (!connection || !column.reference) return '';
    const chosen = ColumnDisplay.displayColumnOf(connection.id, column.reference.table);
    if (chosen !== undefined) return chosen;
    const table = tableManager.getTablesListForDatabase(connection, {name: column.reference.table.databaseName})
      .find((item) => item.tableName === column.reference!.table.name);
    if (!table) {
      tableManager.askForTableList(connection, {name: column.reference.table.databaseName}, false);
    }
    return ColumnDisplay.guessDisplayColumn(table);
  }, [connection, version]);

  // labels of referenced rows for values on the page
  useEffect(() => {
    if (!connection || !loaded) return;
    let active = true;
    const sql = DriverFactory.getDriver(connection).sql;
    const records = getRecords();
    const next: GridDisplayInterface['labels'] = {};
    const loads = columns.filter((column) => column.reference).map(async (column) => {
      const reference = column.reference!;
      const display = displayColumnOf(column);
      if (!display || display === reference.columnName) return;
      // binary keys by their bytes, long binary values are not known whole
      const unique = new Map<string, any>();
      records.map((row) => row[column.key])
        .filter((value) => value !== null && value !== undefined && !(isBinaryValue(value) && value.truncated))
        .forEach((value) => unique.size < MAX_LABEL_VALUES && unique.set(valueKey(value), isBinaryValue(value) ? value : String(value)));
      const values = Array.from(unique.values());
      if (!values.length) return;
      const query = `SELECT ${sql.identifier(reference.columnName)} AS ${sql.identifier('k')}, ${sql.identifier(display)} AS ${sql.identifier('v')} `
        + `FROM ${sql.table(reference.table.databaseName, reference.table.name)} WHERE ${sql.identifier(reference.columnName)} IN (${values.map((value) => sql.value(value)).join(', ')})`;
      try {
        const rows = await selectRows(connection, query, reference.table.databaseName);
        next[column.key] = Object.fromEntries(rows.map((row) => [valueKey(row.k), row.v === null || row.v === undefined ? 'NULL' : typeof row.v === 'object' ? JSON.stringify(row.v) : String(row.v)]));
      } catch (e) {
        // missing privileges or removed column - only key is shown
      }
    });
    Promise.all(loads).then(() => active && setLabels(next));
    return () => {
      active = false;
    };
  }, [connection, columns, loaded, version, displayColumnOf]);

  const display = useMemo((): GridDisplayInterface => ({transforms, labels}), [transforms, labels]);

  const actions = useMemo((): GridDisplayActionsInterface => {
    /** primary key values of row of editable result, null when row cannot be identified */
    const whereOf = (column: ColumnInterface, row: SingleRowType | undefined): {[name: string]: any} | null => {
      if (!editable?.primaryKey.length || !column.table?.name || !row) return null;
      const where: {[name: string]: any} = {};
      for (const key of editable.primaryKey) {
        const keyColumn = columns.find((item) => item.key === key);
        where[keyColumn?.orgName || key] = row[key];
      }
      return where;
    };
    /** whole value of cell as bytes - server sends texts as UTF-8 too */
    const requestValue = (column: ColumnInterface, where: {[name: string]: any}): Promise<{bytes: Uint8Array, mimeType: string | null}> => new Promise((resolve, reject) => {
      const tabId = `binary-value:${++requestCounter}`;
      const eventId = EventBus.subscribe<MessageInterface<any>>(WebsocketReceivedAMessage.name, (event) => {
        const message = event.getData();
        if (message.payload?.tabId !== tabId) return;
        EventBus.unSub(eventId);
        if (message.message === MessageType.BINARY_VALUE) {
          const result = message.payload as BinaryValueResultInterface;
          resolve({bytes: Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0)), mimeType: result.mimeType});
        } else {
          reject(new Error(message.payload?.error));
        }
      });
      sendServerCommand(connection!, CommandType.GET_BINARY_VALUE, {tabId, table: editable!.table, column: column.orgName || column.name, where});
    });

    return {
      openImage,
      loadBinary: (column, rowIndex) => {
        // row is identified by primary key of editable result
        const row = getRecords()[rowIndex];
        const where = whereOf(column, row);
        if (!connection || !where) return null;
        // value of the row as grid has it - changed value (saved by editor, reload) is loaded again, not old file from cache
        const preview = row[column.key];
        const cacheKey = JSON.stringify([connection.id, column.table, column.orgName || column.name, where,
          isBinaryValue(preview) ? [preview.size, preview.hex] : null]);
        if (!binaryCache.has(cacheKey)) {
          const loading = requestValue(column, where).then(({bytes, mimeType}) => ({
            url: URL.createObjectURL(new Blob([bytes], {type: mimeType || 'application/octet-stream'})),
            mimeType,
          }));
          loading.catch(() => binaryCache.delete(cacheKey));
          binaryCache.set(cacheKey, loading);
        }
        return binaryCache.get(cacheKey)!;
      },
      loadText: (column, rowIndex) => {
        const where = whereOf(column, getRecords()[rowIndex]);
        if (!connection || !where) return null;
        return requestValue(column, where).then(({bytes}) => new TextDecoder().decode(bytes));
      },
    };
  }, [connection, editable, columns, openImage]);

  /** "Display as" and "Show from referenced table" of column */
  const menuItems = (column: ColumnInterface): ContextMenuItem[] => {
    if (!connection || !column.table?.name) return [];
    const current = ColumnDisplay.transformOf(connection.id, column);
    const recognized = !current && transforms[column.key] === 'uuid';
    const items: ContextMenuItem[] = [{
      label: 'Display column as',
      children: TRANSFORMS.filter((item) => item.applies(column.type || '')).map((item) => ({
        label: item.transform === '' && recognized ? `${item.label} - recognized as UUID` : item.label,
        hint: current === item.transform ? '✓' : undefined,
        onClick: () => ColumnDisplay.setTransform(connection.id, column, item.transform),
      })),
    }];
    if (column.reference) {
      const reference = column.reference;
      const table = tableManager.getTablesListForDatabase(connection, {name: reference.table.databaseName}).find((item) => item.tableName === reference.table.name);
      const shown = displayColumnOf(column);
      items.push({
        label: `Show from ${reference.table.name}`,
        children: [
          {label: 'Only key', hint: !shown ? '✓' : undefined, onClick: () => ColumnDisplay.setDisplayColumn(connection.id, reference.table, '')},
          'separator',
          ...(table?.columns || []).filter((item) => item.name !== reference.columnName).map((item): ContextMenuItem => ({
            label: item.name,
            hint: shown === item.name ? '✓' : undefined,
            onClick: () => ColumnDisplay.setDisplayColumn(connection.id, reference.table, item.name),
          })),
        ],
      });
    }
    return items;
  };

  return {display, actions, menuItems};
};

export default useGridDisplay;
