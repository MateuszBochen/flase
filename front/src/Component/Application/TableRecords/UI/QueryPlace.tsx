import React, {useCallback, useEffect, useState} from 'react';
import IconButton from '../../../../UI/Button/IconButton';
import {faCopy, faEraser, faMagnifyingGlassChart, faPenToSquare, faRotateRight, faTable, faTableColumns, faTrashCan} from '@fortawesome/free-solid-svg-icons';
import Editor from '../../../../UI/Editor/Editor';
import defaultMysqlKeyWords from '../../../../Library/Database/Driver/Adapter/MySql/DefaultAutocompleteKeywords';
import QueryPlacePropsInterface from '../Interface/QueryPlacePropsInterface';
import DriverFactory from '../../../../Library/Database/Driver/DriverFactory';
import QueryHistory from './QueryHistory';
import RecordManager from '../../../../Library/Record/RecordManager';
import QueryRequestDataInterface from '../../../../Library/Record/Interface/QueryRequestDataInterface';
import EventBus from '../../../../Library/EventBus/EventBus';
import QueryWasChanged from '../Event/QueryWasChanged';
import QueryInterface from '../../../../Library/Database/Interface/QueryInterface';
import TableManager from '../../../../Library/Table/TableManager';
import PageWasChanged from '../Event/PageWasChanged';
import MessageInterface from '../../../../Library/WebSocket/Interface/MessageInterface';
import SingleSelectRecordInterface from '../../../../Library/Record/Interface/SingleSelectRecordInterface';
import WebsocketReceivedAMessage from '../../../../Library/WebSocket/Event/WebsocketReceivedAMessage';
import MessageType from '../../../../Library/WebSocket/Enum/MessageType';
import PaginationDataInterface from '../Interface/PaginationDataInterface';
import SortDirectionDataInterface from '../Interface/SortDirectionDataInterface';
import OrderDirectionWasChanged from '../Event/OrderDirectionWasChanged';
import SortTableItemInterface from '../../../Table/Interface/SortTableItemInterface';
import QueryRefreshWasRequested from '../Event/QueryRefreshWasRequested';
import {CompletionTableType} from '../../../../UI/Editor/SqlCompletion';
import FilterWasRequested, {FilterRequestType} from '../Event/FilterWasRequested';
import QueryStore from '../../../../Library/Console/QueryStore';
import toast from 'react-hot-toast';

/** QueryPlace */
export default (props: QueryPlacePropsInterface) => {

  const [currentQuery, setCurrentQuery] = useState<QueryInterface>(() => {
    const defaultQuery = DriverFactory.getDriver(props.connection).getDefaultQuery(props.table);
    return props.initialQuery ? defaultQuery.changeQuery(props.initialQuery) : defaultQuery;
  });
  const [hints, setHints] = useState<string[]>([]);
  const tableManager = TableManager.getInstance();

  useEffect(() => {
    changeQueryHandler(currentQuery);


    /** handle event of page change */
    const eventPaginationEventId = EventBus.subscribe<PaginationDataInterface>(PageWasChanged.name, (event) => {
      const eventData = event.getData();
      if (eventData.tabId === props.tabId) {
        setCurrentQuery((previousQuery) => {
          const newQueryModel = previousQuery.changeOffset(eventData.page * eventData.perPage);
          changeQueryHandler(newQueryModel);
          return newQueryModel;
        });
      }
    });

    /** handle event of order change */
    const eventOrderId = EventBus.subscribe<SortDirectionDataInterface>(OrderDirectionWasChanged.name, (event) => {
      const eventData = event.getData();
      if (eventData.tabId === props.tabId) {
        setCurrentQuery((previousQuery) => {

          const sortItem: SortTableItemInterface = {
            column: eventData.column,
            direction: eventData.direction,
          }
          const newQueryModel = previousQuery.changeOrder([sortItem]);
          changeQueryHandler(newQueryModel);
          return newQueryModel;
        });
      }
    });

    /** run current query again, e.g. after rows were saved */
    const eventRefreshId = EventBus.subscribe<string>(QueryRefreshWasRequested.name, (event) => {
      if (event.getData() === props.tabId) {
        setCurrentQuery((previousQuery) => {
          changeQueryHandler(previousQuery);
          return previousQuery;
        });
      }
    });

    /** quick filter from grid - condition is added with AND */
    const eventFilterId = EventBus.subscribe<FilterRequestType>(FilterWasRequested.name, (event) => {
      const data = event.getData();
      if (data.tabId !== props.tabId) {
        return;
      }
      setCurrentQuery((previousQuery) => {
        const current = previousQuery.getWhere();
        const where = data.condition === null ? '' : current ? `(${current}) AND ${data.condition}` : data.condition;
        return applyWhere(previousQuery, where);
      });
    });

    return () => {
      EventBus.unSub(eventPaginationEventId);
      EventBus.unSub(eventOrderId);
      EventBus.unSub(eventRefreshId);
      EventBus.unSub(eventFilterId);
    };




    /*tableManager.getTablesListForDatabase(props.connection, props.database)
      .filter((table) => table.tableName === props.table.tableName)
      .forEach((table) => {
        const hints = table.columns.map((column) => `\`${column.name}\``);
        console.log(hints);
        setHints(hints);
      });*/
  }, []);

  const onSearchHandler = useCallback((newQuery: string) => {
    QueryStore.getInstance().addHistory(props.connection.id, {sql: newQuery, database: props.database.name, executedAt: Date.now(), durationMs: -1});
    setCurrentQuery((previousQuery) => {
      const newQueryModel = previousQuery.changeQuery(newQuery);
      changeQueryHandler(newQueryModel);
      return newQueryModel;
    });

  }, [currentQuery]);

  const onHistoryChange = useCallback((historyQuery: string) => {
    setCurrentQuery((previousQuery) => {
      const newQueryModel = previousQuery.changeQuery(historyQuery);
      changeQueryHandler(newQueryModel);
      return newQueryModel;
    });
  }, [currentQuery]);

  /** tables of current database with columns known from table list */
  const getCompletionTables = (): CompletionTableType[] => tableManager
    .getTablesListForDatabase(props.connection, props.database)
    .map((table) => ({
      name: table.tableName,
      columns: table.columns.map((column) => ({name: column.name, type: column.type})),
    }));

  /** new query with given WHERE, invalid condition keeps current query */
  const applyWhere = (previousQuery: QueryInterface, where: string): QueryInterface => {
    try {
      const newQueryModel = previousQuery.changeWhere(where);
      changeQueryHandler(newQueryModel);
      return newQueryModel;
    } catch (e: any) {
      toast.error(`Invalid filter: ${(e?.message || String(e)).slice(0, 120)}`);
      return previousQuery;
    }
  };

  const changeQueryHandler = useCallback((query: QueryInterface) => {
    if (props.queryRef) {
      props.queryRef.current = query;
    }
    console.log('new Query', query.query);

    const queryRequest: QueryRequestDataInterface = {
      query: query,
      database: props.database,
      tabId: props.tabId,
    }

    EventBus.emit<QueryRequestDataInterface>(new QueryWasChanged(queryRequest));

    RecordManager.getInstance().sendQuery(
      props.connection,
      queryRequest
    );

  }, []);

  return (
    <div className="cmp-table-data-header">
      <div className="speed-dial-buttons">
        <IconButton
          icon={faTable}
          tooltip="Data"
          active={props.view === 'data'}
          onClick={() => props.onViewChange('data')}
        />
        <IconButton
          icon={faTableColumns}
          tooltip="Structure"
          active={props.view === 'structure'}
          onClick={() => props.onViewChange('structure')}
        />
        <span className="speed-dial-separator" />
        <IconButton
          icon={faRotateRight}
          tooltip={props.view === 'data' ? 'Reload data' : 'Reload structure'}
          disabled={props.tableOperationsDisabled}
          onClick={props.onReload}
        />
        <IconButton
          icon={faMagnifyingGlassChart}
          tooltip="Explain query"
          disabled={props.view !== 'data' || props.tableOperationsDisabled}
          onClick={props.onExplain}
        />
        <span className="speed-dial-separator" />
        <IconButton icon={faPenToSquare} tooltip="Rename table…" disabled={props.tableOperationsDisabled} onClick={() => props.onTableOperation('rename')} />
        <IconButton icon={faCopy} tooltip="Copy table…" disabled={props.tableOperationsDisabled} onClick={() => props.onTableOperation('copy')} />
        <IconButton icon={faEraser} tooltip="Truncate table…" danger disabled={props.tableOperationsDisabled} onClick={() => props.onTableOperation('truncate')} />
        <IconButton icon={faTrashCan} tooltip="Drop table…" danger disabled={props.tableOperationsDisabled} onClick={() => props.onTableOperation('drop')} />
      </div>
      <div className="cmp-table-data-navbar" style={{display: props.view === 'data' ? undefined : 'none'}}>
        <div className="cmp-table-data-navbar-buttons">
          <QueryHistory value={currentQuery.query} onHistoryChange={onHistoryChange} />
          <div className="icon database-name">
            {props.database.name}://
          </div>
        </div>
        <div className="cmp-table-data-navbar-editor-wrapper">
          <Editor
            defaultText={currentQuery.query}
            syntax={"sql"}
            hints={hints}
            customKeyWords={defaultMysqlKeyWords}
            getCompletionTables={getCompletionTables}
            isOneliner={true}
            onSearch={onSearchHandler}
           /* }
            onSearch={() => {}}
            hints={[]}*/
          />
        </div>
      </div>
    </div>
  );
  /*  }*/
}

