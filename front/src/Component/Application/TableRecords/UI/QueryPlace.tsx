import React, {useCallback, useEffect, useState} from 'react';
import IconButton from '../../../../UI/Button/IconButton';
import {faList, faQuestion} from '@fortawesome/free-solid-svg-icons';
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

/** QueryPlace */
export default (props: QueryPlacePropsInterface) => {

  const [currentQuery, setCurrentQuery] = useState<QueryInterface>(DriverFactory.getDriver(props.connection).getDefaultQuery(props.table));
  const [hints, setHints] = useState<string[]>([]);
  const tableManager = TableManager.getInstance();

  useEffect(() => {
    changeQueryHandler(currentQuery);

    /*tableManager.getTablesListForDatabase(props.connection, props.database)
      .filter((table) => table.tableName === props.table.tableName)
      .forEach((table) => {
        const hints = table.columns.map((column) => `\`${column.name}\``);
        console.log(hints);
        setHints(hints);
      });*/
  }, []);

  const onSearchHandler = useCallback((newQuery: string) => {
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

  const changeQueryHandler = useCallback((query: QueryInterface) => {
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
          icon={faList}
          onClick={() => {}}
        />
        <IconButton
          icon={faQuestion}
          onClick={() => {}}
        />
      </div>
      <div className="cmp-table-data-navbar">
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

