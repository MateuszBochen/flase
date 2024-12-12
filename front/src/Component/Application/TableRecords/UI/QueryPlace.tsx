import React, {Component, useCallback, useEffect, useState} from 'react';
import IconButton from '../../../../UI/Button/IconButton';
import {faArrowLeft, faArrowRight, faList, faQuestion} from '@fortawesome/free-solid-svg-icons';
import Editor from '../../../../UI/Editor/Editor';
/*# import connect from 'react-redux/es/connect/connect';
# import IconButton from "../../../Components/Buttons/IconButton";
# import {faArrowLeft, faArrowRight, faList, faQuestion} from "@fortawesome/fontawesome-free-solid";
# import Editor from "../../../Components/Editor/Editor";
# import ApplicationManager from '../Application/ApplicationManager';*/
import defaultMysqlKeyWords from '../../../../Library/Database/Driver/Adapter/MySql/DefaultAutocompleteKeywords';
import QueryPlacePropsInterface from '../Interface/QueryPlacePropsInterface';
import DriverFactory from '../../../../Library/Database/Driver/DriverFactory';
import QueryHistory from './QueryHistory';
import RecordManager from '../../../../Library/Record/RecordManager';
import QueryRequestDataInterface from '../../../../Library/Record/Interface/QueryRequestDataInterface';
import EventBus from '../../../../Library/EventBus/EventBus';
import QueryWasChanged from '../Event/QueryWasChanged';

/** QueryPlace */
export default (props: QueryPlacePropsInterface) => {

  const [currentQuery, setCurrentQuery] = useState<string>(DriverFactory.getDriver(props.connection).getDefaultQuery(props.table));


  useEffect(() => {
    changeQueryHandler(currentQuery);
  }, []);

  const onSearchHandler = useCallback((newQuery: string) => {
    setCurrentQuery(newQuery);
    changeQueryHandler(newQuery);
  }, [currentQuery]);

  const onHistoryChange = useCallback((historyQuery: string) => {
    setCurrentQuery(historyQuery);
    changeQueryHandler(historyQuery);
  }, [currentQuery]);

  const changeQueryHandler = useCallback((query: string) => {
    console.log('new Query', query);

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
      <div className="cmp-table-data-navbar">
        <div className="cmp-table-data-navbar-buttons">
          <QueryHistory value={currentQuery} onHistoryChange={onHistoryChange} />
          <div className="icon database-name">
            {props.database.name}://
          </div>
        </div>
        <div className="cmp-table-data-navbar-editor-wrapper">
          <Editor
            defaultText={currentQuery}
            syntax={"sql"}
            hints={defaultMysqlKeyWords}
            isOneliner={true}
            onSearch={onSearchHandler}
           /* }
            onSearch={() => {}}
            hints={[]}*/
          />
        </div>
      </div>
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
    </div>
  );
  /*  }*/
}

