import React, {Component} from "react";
import connect from 'react-redux/es/connect/connect';
import IconButton from "../../../Components/Buttons/IconButton";
import {faArrowLeft, faArrowRight, faList, faQuestion} from "@fortawesome/fontawesome-free-solid";
import Editor from "../../../Components/Editor/Editor";
import ApplicationManager from '../Application/ApplicationManager';


class QueryPlace extends Component {
    /** @type ApplicationManager */
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
        const { currentQueryIndex, queryHistory, tableName } = this.props;

        return (
            <div className="cmp-table-data-header">
                <div className="cmp-table-data-navbar">
                    <div className="cmp-table-data-navbar-buttons">
                        <div className="icon">
                            <IconButton
                                disabled={currentQueryIndex <= 0 }
                                icon={faArrowLeft}
                                onClick={() => this.goToQueryHandler(currentQueryIndex - 1)}
                            />
                        </div>
                        <div className="icon">
                            <IconButton
                                disabled={currentQueryIndex + 2 > queryHistory.length}
                                icon={faArrowRight}
                                onClick={() => this.goToQueryHandler(currentQueryIndex + 1)}
                            />
                        </div>
                        <div className="icon database-name">
                            {database}://
                        </div>
                    </div>
                    <Editor
                        onChange={(e) => this.setState({currentQuery: e.target.value})}
                        onSearch={this.sqlEditHandler}
                        hints={[tableName, ...this.props.columns.map(item => item.name)]}
                    >
                        {currentQuery}
                    </Editor>
                </div>
                <div className="speed-dial-buttons">
                    <IconButton
                        icon={faList}
                        onClick={this.applicationManager.reSendMainQuery}
                    />
                    <IconButton
                        icon={faQuestion}
                    />
                </div>
            </div>
        );
    }
}

const mapStateToProps = (state) => ({...state});

export default connect(mapStateToProps)(QueryPlace);
