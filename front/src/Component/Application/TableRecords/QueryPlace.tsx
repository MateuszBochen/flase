import React, {Component, useCallback, useState} from 'react';
import IconButton from '../../../UI/Button/IconButton';
import {faArrowLeft, faArrowRight, faList, faQuestion} from '@fortawesome/free-solid-svg-icons';
import Editor from '../../../UI/Editor/Editor';
/*# import connect from 'react-redux/es/connect/connect';
# import IconButton from "../../../Components/Buttons/IconButton";
# import {faArrowLeft, faArrowRight, faList, faQuestion} from "@fortawesome/fontawesome-free-solid";
# import Editor from "../../../Components/Editor/Editor";
# import ApplicationManager from '../Application/ApplicationManager';*/
import defaultMysqlKeyWords from '../../../Library/Database/Driver/Adapter/MySql/DefaultAutocompleteKeywords';
import QueryPlacePropsInterface from './Interface/QueryPlacePropsInterface';
import DriverFactory from '../../../Library/Database/Driver/DriverFactory';
import QueryHistory from './QueryHistory';

/** QueryPlace */
export default (props: QueryPlacePropsInterface) => {

  const [currentQuery, setCurrentQuery] = useState<string>(DriverFactory.getDriver(props.connection).getDefaultQuery(props.table));


  const onSearchHandler = useCallback((newQuery: string) => {
    console.log(newQuery);
    setCurrentQuery(newQuery);
  }, [currentQuery]);

  const onHistoryChange = useCallback((historyQuery: string) => {
    console.log(historyQuery);
    setCurrentQuery(historyQuery);
  }, [currentQuery])

  /*/!** @type ApplicationManager *!/
  applicationManager = undefined;

  constructor(props) {
      super(props);
      this.applicationManager = ApplicationManager.getInstance(props.tabIndex);
      this.state = {
          currentQuery: this.props.query,
      }
  }

  componentDidUpdate(prevProps, prevState, snapshot) {
      if (prevProps.query !== this.props.query) {
          this.setState({
              currentQuery: this.props.query,
          });
      }
  }

  sqlEditHandler = () => {
      const { query } = this.props;
      if (this.state.currentQuery !== query) {
          this.applicationManager.sendQuery(this.state.currentQuery);
      } else {
          this.applicationManager.sendQuery();
      }
  }

  goToQueryHandler = (queryIndex) => {
      this.applicationManager.historyQuery(queryIndex);
  }

  render() {
      const { database } = this.props;
      const { currentQuery } = this.state;
      const { currentQueryIndex, queryHistory, tableName } = this.props;*/

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
            onChange={(e) => {}}
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

