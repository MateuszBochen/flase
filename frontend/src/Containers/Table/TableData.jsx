import React, {Component} from 'react';
import { FontAwesomeIcon} from '@fortawesome/react-fontawesome';
import { faArrowLeft, faArrowRight } from '@fortawesome/fontawesome-free-solid';
import SqlRequest from '../../API/SqlRequest';
import BaseRequest from "../../API/BaseRequest";
import LoaderSquare from '../../Components/Loader/LoaderSquare';
import RecordsView from '../../Components/Table/RecordsView';
import Editor from '../../Components/Editor/Editor';
import SqlRegex from '../../Library/SqlRegex';
import WorkPlaceAction from '../../Actions/WorkPlaceAction';
import IconButton from '../../Components/Buttons/IconButton';
import './style.css';


class TableData extends Component {
    constructor(props) {
        super(props);
        const { tableName, query } = this.props;

        const currentQuery = query || `SELECT * FROM \`${tableName}\` WHERE 1 LIMIT 50`;

        this.state = {
            isLoading: true,
            query: currentQuery,
            data: [],
            page: 0,
            perPage: 50,
            queries: [currentQuery],
            queryIndex: 0,
        }

        this.sqlRequest = new SqlRequest();
        this.sqlRegex = new SqlRegex();
        this.workPlaceAction = new WorkPlaceAction();
    }

    componentDidMount() {
        this.sendQuery();
    }

    pageChangeHandler = (newPageNumber) => {
        const sql = this.sqlRegex.setLimitToSql(this.state.query, newPageNumber * this.state.perPage, this.state.perPage);
        this.addQueryToHistory(sql);
        this.sendQuery(sql, newPageNumber);
    }

    relationClickHandler = (button, column, value) => {
        const { database } = this.props;
        const query = `SELECT * FROM \`${column.referenceTable}\` WHERE \`${column.referenceColumn}\` = '${value}' LIMIT 50`;
        if (button === 1) {
            this.workPlaceAction.addNewTableDataTab(database, column.name, {query});
        }

        if (button === 0) {
            this.addQueryToHistory(query);
            this.sendQuery(query);
        }
    }

    goToQueryHandler = (queryIndex) => {
        const { queries } = this.state;
        const query = queries[queryIndex];
        if (query) {
            this.sendQuery(query);
            this.setState({
                queryIndex: queryIndex,
            });
        }
    }

    addQueryToHistory = (newQuery) => {
        let { queries, queryIndex } = this.state;
        if (queries.length - 1 > queryIndex) {
            queries = queries.slice(0, queryIndex + 1);
        }

        this.setState({
            query: newQuery,
            queries: [...queries, newQuery],
            queryIndex: queryIndex + 1,
        });
    }

    sendQuery = (query, page) => {
        const { database } = this.props;
        this.setState({
            isLoading: true,
        });
        this.sqlRequest
            .query(database, query || this.state.query)
            .then((response) => {
                if (response.status === BaseRequest.STATUS_OK) {
                    this.setState({
                        data: response.data.data,
                        isLoading: false,
                        page: page || 0,
                        query: query || this.state.query,
                    });
                }
            });
    }

    renderData = () => {
        const { isLoading, data, page } = this.state;
        if (isLoading) {
            return (
                <div className="cmp-table-data">
                    <LoaderSquare />
                </div>
            );
        }

        return (
            <div className="cmp-table-data">
                <RecordsView
                    columns={data.columns}
                    records={data.records}
                    total={data.total}
                    page={page}
                    perPage={50}
                    onPageChange={this.pageChangeHandler}
                    onReferenceClick={this.relationClickHandler}
                />
            </div>
        );

    }

    render() {
        const { query, queries, queryIndex } = this.state;
        const { database } = this.props;
        return (
            <div className="cmp-table-data">
                <div className="cmp-table-data-header">
                    <div className="cmp-table-data-navbar">
                        <div className="cmp-table-data-navbar-buttons">
                            <div className="icon">
                                <IconButton
                                    disabled={queryIndex <= 0 }
                                    icon={faArrowLeft}
                                    onClick={() => this.goToQueryHandler(queryIndex - 1)}
                                />
                            </div>
                            <div className="icon">
                                <IconButton
                                    disabled={queryIndex + 2 > queries.length}
                                    icon={faArrowRight}
                                    onClick={() => this.goToQueryHandler(queryIndex + 1)}
                                />
                            </div>
                            <div className="icon database-name">
                                {database}://
                            </div>
                        </div>
                        <Editor
                            onChange={(e) => this.setState({query: e.target.value})}
                            onSearch={() => this.sendQuery()}
                        >
                            {query}
                        </Editor>
                    </div>
                </div>
                <div className="cmp-table-data-content">
                    {this.renderData()}
                </div>
            </div>
        );
    }
}

export default TableData;
