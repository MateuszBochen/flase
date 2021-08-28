import React, {Component} from "react";
import connect from 'react-redux/es/connect/connect';
import IconButton from "../../Components/Buttons/IconButton";
import {faArrowLeft, faArrowRight} from "@fortawesome/fontawesome-free-solid";
import Editor from "../../Components/Editor/Editor";
import StoreManager from "./Store/StoreManager";


class QueryPlace extends Component {
    constructor(props) {
        super(props);

        this.state = {
            currentQuery: this.props.query,
            queries: []
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
        const { tabIndex, query, onReload } = this.props;
        if (this.state.currentQuery !== query) {
            StoreManager.dispatch(
                tabIndex,
                'CHANGE_QUERY',
                this.state.currentQuery,
            );
        } else {
            StoreManager.dispatch(
                tabIndex,
                'RELOAD_QUERY',
                this.state.currentQuery,
            );
            onReload(this.state.currentQuery);
        }
    }

    goToQueryHandler = (queryIndex) => {
        const { tabIndex } = this.props;
        StoreManager.dispatch(
            tabIndex,
            'GO_TO_QUERY_HISTORY',
            queryIndex,
        );
    }

    render() {
        const { database } = this.props;
        const { currentQuery } = this.state;
        const { currentQueryIndex, queryHistory } = this.props;

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
                    >
                        {currentQuery}
                    </Editor>
                </div>
            </div>
        );
    }
}

const mapStateToProps = (state) => ({...state});

export default connect(mapStateToProps)(QueryPlace);
