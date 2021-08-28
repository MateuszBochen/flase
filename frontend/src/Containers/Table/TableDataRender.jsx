import React, {Component} from 'react';
import connect from 'react-redux/es/connect/connect';

import SqlRequest from '../../API/SqlRequest';
import LoaderSquare from '../../Components/Loader/LoaderSquare';
import RecordsView from '../../Components/Table/RecordsView';
import SqlRegex from '../../Library/SqlRegex';
import WorkPlaceAction from '../../Actions/WorkPlaceAction';
import TableDataLibrary from '../../Library/DataHelpers/TableData';
import CellValue from './CellValue';
import StoreManager from './Store/StoreManager';
import QueryPlace from './QueryPlace';
import './style.css';

class TableDataRender extends Component {
    constructor(props) {
        super(props);
        this.tabIndex = this.props.tabIndex;

        this.sqlRegex = new SqlRegex();
        this.sqlRequest = new SqlRequest();
        this.workPlaceAction = new WorkPlaceAction();
        this.tableDataLibrary = new TableDataLibrary();
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
        /*const { data } = this.state;

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

        const { database, tableName } = this.props;*/


    }

    /**
     * @param {Column} column - column object
     * @param {Array} rowObject - row with all data
     */
    cellFunction = (column, rowObject) => {
        const { columns, tabIndex } = this.props;

        const cellValue = rowObject.rowValues[column.name];
        const key = `cv_${rowObject.id}_${column.name}${cellValue}`;

        if (rowObject.rowValues[column.name] === undefined) {
            return ('<no-value>');
        }

        const hasPrimary = this.checkForPrimary(this.tableDataLibrary.prepareColumnsDataType(columns));

        return (
            <CellValue
                key={key}
                column={column}
                rowItem={rowObject.rowValues}
                onRelationClick={this.relationClickHandler}
                hasPrimary={hasPrimary}
                onUpdate={this.onUpdateCellValue}
            />
        );
    }

    renderData = () => {
        const { columns, records, recordsLoaded, limit, totalRows, offset} = this.props;
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
                    columns={this.tableDataLibrary.addFunctionsToColumns(this.tableDataLibrary.prepareColumnsDataType(columns), this.cellFunction)}
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
