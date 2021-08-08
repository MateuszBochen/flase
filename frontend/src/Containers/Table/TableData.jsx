import React, {Component} from 'react';
import { faArrowLeft, faArrowRight } from '@fortawesome/fontawesome-free-solid';
import SqlRequest from '../../API/SqlRequest';
import BaseRequest from "../../API/BaseRequest";
import LoaderSquare from '../../Components/Loader/LoaderSquare';
import RecordsView from '../../Components/Table/RecordsView';
import Editor from '../../Components/Editor/Editor';
import SqlRegex from '../../Library/SqlRegex';
import WorkPlaceAction from '../../Actions/WorkPlaceAction';
import IconButton from '../../Components/Buttons/IconButton';
import TableDataLibrary from '../../Library/DataHelpers/TableData';
import CellValue from './CellValue';

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
        this.tableDataLibrary = new TableDataLibrary();
        this.hasPrimary = null;
    }

    componentDidMount() {
        this.sendQuery();
    }

    pageChangeHandler = (newPageNumber) => {
        const sql = this.sqlRegex.setLimitToSql(this.state.query, newPageNumber * this.state.perPage, this.state.perPage);
        this.addQueryToHistory(sql);
        this.sendQuery(sql, newPageNumber);
    }

    /**
     * @param {MouseEvent} event
     * @param {Column} column
     * @param {any} value
     */
    relationClickHandler = (event, column, value) => {
        event.stopPropagation();
        event.preventDefault();

        const { database } = this.props;
        const query = `SELECT * FROM \`${column.referenceTable}\` WHERE \`${column.referenceColumn}\` = '${value}' LIMIT 50`;
        if (event.button === 1) {
            this.workPlaceAction.addNewTableDataTab(database, column.name, {query});
        }

        if (event.button === 0) {
            this.addQueryToHistory(query);
            this.sendQuery(query);
        }
    }

    sortHandler = (column, direction) => {
        const { page } = this.state;
        const sql = this.sqlRegex.setOrderByToSql(this.state.query, column.name, direction);
        this.addQueryToHistory(sql);
        this.sendQuery(sql, page);
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
            })
            .catch(() => {
                this.setState({
                    isLoading: false,
                });
            });
    }

    checkForPrimary = (columns) => {
        if (this.hasPrimary !== null) {
            return this.hasPrimary;
        }

        columns.forEach((column) => {
            if (column.autoIncrement === true) {
                this.hasPrimary = true;
            }
        });

        if (!this.hasPrimary) {
            this.hasPrimary = false;
        }

        return this.hasPrimary;
    }

    /**
     * @param {Column} column - column object
     * @param {string} newValue - row with all data
     * @param {object} rowItem - row with all data
     */
    onUpdateCellValue = (column, newValue, rowItem) => {
        const { data } = this.state;

        let primaryColumnName = null;
        let primaryColumnValue = null;
        data.columns.forEach((column) => {
            if (column.autoIncrement === true) {
                primaryColumnName = column.name;
            }
        });

        if (primaryColumnName === null) {
            return;
        }

        primaryColumnValue = rowItem[primaryColumnName];

        const { database, tableName } = this.props;

        this.sqlRequest
            .simpleUpdate(database, tableName, primaryColumnName, primaryColumnValue, column.name, newValue)
            .then((response) => {
                /*this.sqlRequest
                    .query(database, this.state.query)
                    .then((response) => {
                        if (response.status === BaseRequest.STATUS_OK) {
                            this.setState({
                                data: response.data.data,
                            });
                        }
                    });*/
            });
    }

    /**
     * @param {Column} column - column object
     * @param {Array} rowObject - row with all data
     */
    cellFunction = (column, rowObject) => {
        const { data } = this.state;
        if (rowObject[column.name] === undefined) {
            return ('<no-value>');
        }

        const hasPrimary = this.checkForPrimary(this.tableDataLibrary.prepareColumnsDataType(data.columns));

        return (
            <CellValue
                key={rowObject[column.name]}
                column={column}
                rowItem={rowObject}
                onRelationClick={this.relationClickHandler}
                hasPrimary={hasPrimary}
                onUpdate={this.onUpdateCellValue}
            />
        );
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
                    columns={this.tableDataLibrary.addFunctionsToColumns(this.tableDataLibrary.prepareColumnsDataType(data.columns), this.cellFunction)}
                    records={data.records}
                    total={data.total}
                    page={page}
                    perPage={50}
                    onPageChange={this.pageChangeHandler}
                    onSort={this.sortHandler}
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
