import React, {Component} from 'react';
import connect from 'react-redux/es/connect/connect';
import SqlRequest from '../../API/SqlRequest';
import LoaderSquare from '../../Components/Loader/LoaderSquare';
import RecordsView from '../../Components/Table/RecordsView';
import SqlRegex from '../../Library/SqlRegex';
import WorkPlaceAction from '../../Actions/WorkPlaceAction';
import TableDataLibrary from '../../Library/DataHelpers/TableData';
import StoreManager from './Store/StoreManager';
import QueryPlace from './QueryPlace';
import {Alert} from "react-bootstrap";
import './style.css';

class TableDataRender extends Component {

    lastDirection = '';
    lastPageNumber = -1;

    constructor(props) {
        super(props);
        this.tabIndex = this.props.tabIndex;

        this.sqlRegex = new SqlRegex();
        this.sqlRequest = new SqlRequest();
        this.workPlaceAction = new WorkPlaceAction();
        this.tableDataLibrary = new TableDataLibrary();

        this.hasPrimary = -1;
    }

    componentDidMount() {
        this.sendQuery();
    }

    componentWillReceiveProps(nextProps, nextContext) {
        if (nextProps.query && nextProps.query !== this.props.query) {
            this.queryRequest(nextProps.query);
            console.log('poszlo query', nextProps.query);
        }
    }

    pageChangeHandler = (newPageNumber) => {

        if (this.lastPageNumber === newPageNumber) {
            return;
        }

        this.lastPageNumber = newPageNumber;

        const { limit } = this.props;

        if (newPageNumber < 0) {
            return;
        }
        const sql = this.sqlRegex.setLimitToSql(this.props.query, newPageNumber * limit, limit);

        if (!sql) {
            return;
        }

        StoreManager.dispatch(
            this.tabIndex,
            'CHANGE_QUERY',
            sql,
        );
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
            this.workPlaceAction.addNewTableDataTab(database, column.referenceTable, {query});
            return;
        }

        if (event.button === 0) {
            StoreManager.dispatch(
                this.tabIndex,
                'CHANGE_QUERY',
                query,
            );
        }
    }

    sortHandler = (column, direction) => {

        if (this.lastDirection === direction) {
            return;
        }

        this.lastDirection = direction;

        const sql = this.sqlRegex.setOrderByToSql(this.props.query, column.name, direction);
        StoreManager.dispatch(
            this.tabIndex,
            'CHANGE_QUERY',
            sql,
        );
    }

    sendQuery = () => {
        const { query } = this.props;
        this.queryRequest(query);
    }

    queryRequest = (query) => {
        const { database } = this.props;
        this.sqlRequest
            .query(database, query, this.tabIndex);
    }

    /*checkForPrimary = () => {

        if (this.hasPrimary !== -1) {
            return;
        }

        const { tableKeys } = this.props;

        if (!tableKeys || !tableKeys.keys.length) {
            return;
        }

        this.hasPrimary = tableKeys.keys.some((tableKey) => {
            if (tableKey.isUnique) {
                return true;
            }
        });
    }*/

    /*/!**
     * @param {Column} columnToUpdate - column object
     * @param {string} newValue - row with all data
     * @param {object} rowItem - row with all data
     *!/
    onUpdateCellValue = (columnToUpdate, newValue, rowItem) => {
        const { columns } = this.props;

        console.log(this.props);

        console.log(columnToUpdate);
        console.log(rowItem);

        const primaryColumnNames = {};

        columns.forEach((column) => {
            if (column.primaryKey === true) {
                primaryColumnNames[column.name] = undefined;
            }
        });



        Object.entries(primaryColumnNames).forEach(([key]) => {
            if (rowItem.hasOwnProperty(key)) {
                primaryColumnNames[key] = rowItem[key];
            }
        });
        let isOk = true;
        Object.entries(primaryColumnNames).forEach(([key]) => {
            if (primaryColumnNames[key] === undefined) {
                isOk = false;
            }
        });

        if (!isOk) {
            const message = StankTraceDto.createError('Unique identifier could not be found');
            SnackTraceManager.getInstance().addItem(message);
            return;
        }

        console.log(primaryColumnNames);

       /!* primaryColumnNames.forEach((columnName) => {
            if (rowItem.hasOwnProperty(columnName)) {

            }
        });

        console.log(primaryColumnNames);*!/

        /!*






        primaryColumnValue = rowItem[primaryColumnName];

        const { database, tableName } = this.props;*!/


    }*/

    /*/!**
     * @param {Column} column - column object
     * @param {Array} rowObject - row with all data
     *!/
    cellFunction = (column, rowObject) => {
        this.checkForPrimary();

        const cellValue = rowObject.rowValues[column.name];
        const key = `cv_${rowObject.id}_${column.name}${cellValue}`;

        if (rowObject.rowValues[column.name] === undefined) {
            return ('<no-value>');
        }

        return (
            <CellValue
                key={key}
                column={column}
                rowItem={rowObject.rowValues}
                onRelationClick={this.relationClickHandler}
                hasPrimary={this.hasPrimary}
            />
        );
    }*/

    renderData = () => {
        const { columns, records, recordsLoaded, limit, totalRows, offset, queryLoading} = this.props;

        if (totalRows === 0) {
            return (
                <Alert variant="light">
                    No Records find
                </Alert>
            );
        }

        if (!columns || !columns.length) {
            return (
                <div className="cmp-table-data">
                    <LoaderSquare />
                </div>
            );
        }

        return (
            <div className="cmp-table-data">
                <RecordsView
                    queryLoading={queryLoading}
                    columns={this.tableDataLibrary.prepareColumnsDataType(columns)}
                    records={records}
                    total={totalRows}
                    loadedRecords={recordsLoaded}
                    possibleRecords={Math.min(limit, totalRows)}
                    page={Math.floor((offset / limit))}
                    perPage={limit}
                    onPageChange={this.pageChangeHandler}
                    onSort={this.sortHandler}
                />
            </div>
        );
    }

    render() {
        return (
            <div className="cmp-table-data">
                <QueryPlace
                    onReload={this.queryRequest}
                />
                <div className="cmp-table-data-content">
                    {this.renderData()}
                </div>
            </div>
        );
    }
}

const mapStateToProps = (state) => ({...state});

export default connect(mapStateToProps)(TableDataRender);
